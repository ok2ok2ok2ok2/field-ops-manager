/**
 * 同步管理器 — 雙向同步 IndexedDB ↔ Supabase
 * 版本: v3.0
 * 日期: 2026-03-16
 * 檔案: src/lib/syncManager.js
 *
 * v3.0：共用表 push 加樂觀鎖（version 衝突偵測）
 * v2.0：私人表 pull 加 user_id 篩選
 * v1.0：初版
 */

import { supabase } from './supabase'
import db from './offlineDb'
import toast from 'react-hot-toast'

const SHARED_TABLES = ['clients', 'projects', 'devices']
const PRIVATE_TABLES = ['daily_logs', 'work_items']
const JOIN_TABLES = ['project_clients', 'project_devices']

const ALL_MAIN_TABLES = [...SHARED_TABLES, ...PRIVATE_TABLES]

async function getAuthUserId() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id || null
}

/* ========== 完整同步 ========== */

export async function fullSync(onProgress) {
  try {
    const uid = await getAuthUserId()
    if (!uid) {
      console.warn('[SyncManager] 未登入，跳過同步')
      return { success: false, error: '未登入' }
    }

    onProgress?.('pushing')
    await pushLocal(uid)

    onProgress?.('pulling')
    await pullRemote(uid)

    onProgress?.('deleting')
    await processDeleteQueue()

    await db.sync_meta.put({
      table_name: '_last_sync',
      synced_at: new Date().toISOString(),
    })

    onProgress?.('done')
    return { success: true }
  } catch (err) {
    console.error('[SyncManager] fullSync 失敗:', err)
    onProgress?.('error')
    return { success: false, error: err.message }
  }
}

/* ========== 推送本地變更到 Supabase ========== */

async function pushLocal(uid) {
  for (const table of ALL_MAIN_TABLES) {
    const dirtyRows = await db[table].where('_dirty').equals(1).toArray()
    if (dirtyRows.length === 0) continue

    const isShared = SHARED_TABLES.includes(table)

    for (const row of dirtyRows) {
      const { _dirty, ...data } = row

      try {
        if (isShared) {
          // ★ 共用表：樂觀鎖 push
          await pushSharedRow(table, data)
        } else {
          // 私人表：直接 upsert
          const { error } = await supabase
            .from(table)
            .upsert(data, { onConflict: 'id' })
          if (error) throw error
          await db[table].update(row.id, { _dirty: 0 })
        }
      } catch (err) {
        console.warn(`[SyncManager] push ${table}/${row.id} 失敗:`, err.message)
      }
    }
  }

  // 關聯表
  for (const table of JOIN_TABLES) {
    const dirtyRows = await db[table].where('_dirty').equals(1).toArray()
    if (dirtyRows.length === 0) continue

    for (const row of dirtyRows) {
      const { _dirty, ...data } = row
      try {
        const { error } = await supabase.from(table).upsert(data)
        if (error) throw error
        await db[table].update([row.project_id, row.client_id || row.device_id], { _dirty: 0 })
      } catch (err) {
        console.warn(`[SyncManager] push ${table} 失敗:`, err.message)
      }
    }
  }
}

/**
 * ★ 共用表樂觀鎖 push
 *
 * 邏輯：
 * - 先檢查遠端是否存在此 id
 * - 新資料 → insert（version=1）
 * - 既有資料 → update SET version=version+1 WHERE version=本地version
 * - 若 0 rows 更新 → 版本衝突 → 從遠端拉最新覆蓋本地
 */
async function pushSharedRow(table, data) {
  const localVersion = data.version || 1

  // 先檢查遠端是否存在
  const { data: existing, error: fetchErr } = await supabase
    .from(table)
    .select('id, version')
    .eq('id', data.id)
    .maybeSingle()

  if (fetchErr) throw fetchErr

  if (!existing) {
    // 新資料：insert
    const { error } = await supabase.from(table).insert({ ...data, version: 1 })
    if (error) throw error
    await db[table].update(data.id, { _dirty: 0, version: 1 })
    return
  }

  // 既有資料：版本比對
  if (existing.version !== localVersion) {
    // ★ 版本衝突！遠端已被別人改過
    console.warn(`[SyncManager] 版本衝突 ${table}/${data.id}: 本地 v${localVersion}, 遠端 v${existing.version}`)
    toast.error(`資料衝突：此筆${tableLabel(table)}已被其他人修改，將重新載入`, { duration: 4000 })

    // 拉遠端最新版覆蓋本地
    const { data: fresh, error: pullErr } = await supabase
      .from(table)
      .select('*')
      .eq('id', data.id)
      .single()

    if (!pullErr && fresh) {
      await db[table].put({ ...fresh, _dirty: 0 })
    }
    return
  }

  // 版本一致：正常更新，version + 1
  const { version, ...updateData } = data
  const { data: updated, error: updateErr } = await supabase
    .from(table)
    .update({ ...updateData, version: localVersion + 1 })
    .eq('id', data.id)
    .eq('version', localVersion)
    .select()

  if (updateErr) throw updateErr

  if (!updated || updated.length === 0) {
    // 競爭條件：在 select 和 update 之間被改了
    console.warn(`[SyncManager] 競爭衝突 ${table}/${data.id}`)
    toast.error(`資料衝突：此筆${tableLabel(table)}已被其他人修改，將重新載入`, { duration: 4000 })

    const { data: fresh } = await supabase.from(table).select('*').eq('id', data.id).single()
    if (fresh) await db[table].put({ ...fresh, _dirty: 0 })
    return
  }

  // 成功：更新本地 version 和清 dirty
  await db[table].update(data.id, { _dirty: 0, version: localVersion + 1 })
}

function tableLabel(table) {
  const labels = { clients: '客戶', projects: '案件', devices: '設備' }
  return labels[table] || '資料'
}

/* ========== 從 Supabase 拉取最新資料 ========== */

async function pullRemote(uid) {
  for (const table of SHARED_TABLES) {
    await pullTable(table, null)
  }

  for (const table of PRIVATE_TABLES) {
    await pullTable(table, uid)
  }

  for (const table of JOIN_TABLES) {
    try {
      const { data, error } = await supabase.from(table).select('*')
      if (error) throw error

      const dirtyRows = await db[table].where('_dirty').equals(1).toArray()
      await db[table].where('_dirty').notEqual(1).delete()

      if (data && data.length > 0) {
        const dirtyKeys = new Set(dirtyRows.map((r) =>
          `${r.project_id}_${r.client_id || r.device_id}`
        ))
        const newRows = data
          .filter((r) => !dirtyKeys.has(`${r.project_id}_${r.client_id || r.device_id}`))
          .map((r) => ({ ...r, _dirty: 0 }))
        if (newRows.length > 0) await db[table].bulkPut(newRows)
      }
    } catch (err) {
      console.warn(`[SyncManager] pull ${table} 失敗:`, err.message)
    }
  }
}

async function pullTable(table, uid) {
  try {
    let query = supabase.from(table).select('*').order('updated_at', { ascending: false })
    if (uid) query = query.eq('user_id', uid)

    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) {
      if (uid) {
        const allLocal = await db[table].where('_dirty').equals(0).toArray()
        for (const local of allLocal) {
          if (local.user_id === uid) await db[table].delete(local.id)
        }
      }
      return
    }

    for (const remoteRow of data) {
      const localRow = await db[table].get(remoteRow.id)

      if (!localRow) {
        await db[table].put({ ...remoteRow, _dirty: 0 })
      } else if (localRow._dirty === 1) {
        continue
      } else {
        const remoteTime = new Date(remoteRow.updated_at).getTime()
        const localTime = new Date(localRow.updated_at).getTime()
        if (remoteTime > localTime) {
          await db[table].put({ ...remoteRow, _dirty: 0 })
        }
      }
    }

    const remoteIds = new Set(data.map((r) => r.id))
    const allLocal = await db[table].where('_dirty').equals(0).toArray()
    for (const local of allLocal) {
      if (uid && local.user_id !== uid) continue
      if (!remoteIds.has(local.id)) {
        await db[table].delete(local.id)
      }
    }
  } catch (err) {
    console.warn(`[SyncManager] pull ${table} 失敗:`, err.message)
  }
}

/* ========== 處理離線刪除佇列 ========== */

async function processDeleteQueue() {
  const queue = await db.delete_queue.toArray()
  if (queue.length === 0) return

  for (const item of queue) {
    try {
      const { error } = await supabase
        .from(item.table_name)
        .delete()
        .eq('id', item.record_id)

      if (error) throw error
      await db.delete_queue.delete(item.id)
    } catch (err) {
      console.warn(`[SyncManager] delete ${item.table_name}/${item.record_id} 失敗:`, err.message)
    }
  }
}

/* ========== 取得最後同步時間 ========== */

export async function getLastSyncTime() {
  const meta = await db.sync_meta.get('_last_sync')
  return meta?.synced_at || null
}
