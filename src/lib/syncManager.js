/**
 * 同步管理器 — 雙向同步 IndexedDB ↔ Supabase
 * 版本: v1.0
 * 日期: 2026-03-10
 * 檔案: src/lib/syncManager.js
 *
 * 策略：last-write-wins（比較 updated_at）
 * 流程：
 *   1. pushLocal()  — 將本地 _dirty 資料推送到 Supabase
 *   2. pullRemote() — 從 Supabase 拉取最新資料覆蓋本地
 *   3. processDeleteQueue() — 處理離線刪除佇列
 */

import { supabase } from './supabase'
import db from './offlineDb'

// 需要同步的主資料表（關聯表另外處理）
const MAIN_TABLES = ['clients', 'projects', 'devices', 'daily_logs', 'work_items']
const JOIN_TABLES = ['project_clients', 'project_devices']

/* ========== 完整同步（App 啟動或網路恢復時呼叫） ========== */

export async function fullSync(onProgress) {
  try {
    onProgress?.('pushing')
    await pushLocal()

    onProgress?.('pulling')
    await pullRemote()

    onProgress?.('deleting')
    await processDeleteQueue()

    // 更新同步時間
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

async function pushLocal() {
  for (const table of MAIN_TABLES) {
    const dirtyRows = await db[table].where('_dirty').equals(1).toArray()
    if (dirtyRows.length === 0) continue

    for (const row of dirtyRows) {
      // 移除本地專用欄位
      const { _dirty, ...data } = row
      try {
        const { error } = await supabase
          .from(table)
          .upsert(data, { onConflict: 'id' })

        if (error) throw error

        // 推送成功，清除 dirty 標記
        await db[table].update(row.id, { _dirty: 0 })
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

/* ========== 從 Supabase 拉取最新資料 ========== */

async function pullRemote() {
  for (const table of MAIN_TABLES) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order('updated_at', { ascending: false })

      if (error) throw error
      if (!data || data.length === 0) continue

      // 逐筆比較：遠端較新則覆蓋，本地有 dirty 的跳過（以本地為準）
      for (const remoteRow of data) {
        const localRow = await db[table].get(remoteRow.id)

        if (!localRow) {
          // 本地不存在 → 直接寫入
          await db[table].put({ ...remoteRow, _dirty: 0 })
        } else if (localRow._dirty === 1) {
          // 本地有未推送的修改 → 跳過（等 push 處理）
          continue
        } else {
          // 比較 updated_at，遠端較新則覆蓋
          const remoteTime = new Date(remoteRow.updated_at).getTime()
          const localTime = new Date(localRow.updated_at).getTime()
          if (remoteTime > localTime) {
            await db[table].put({ ...remoteRow, _dirty: 0 })
          }
        }
      }

      // 清理本地有但遠端已刪除的資料（非 dirty 的）
      const remoteIds = new Set(data.map((r) => r.id))
      const allLocal = await db[table].where('_dirty').equals(0).toArray()
      for (const local of allLocal) {
        if (!remoteIds.has(local.id)) {
          await db[table].delete(local.id)
        }
      }
    } catch (err) {
      console.warn(`[SyncManager] pull ${table} 失敗:`, err.message)
    }
  }

  // 關聯表：直接全量覆蓋（資料量小）
  for (const table of JOIN_TABLES) {
    try {
      const { data, error } = await supabase.from(table).select('*')
      if (error) throw error

      // 保留本地 dirty 的，其餘清掉重寫
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