/**
 * 離線 API 工具層 — 統一的 IndexedDB CRUD
 * 版本: v3.0
 * 日期: 2026-03-16
 * 檔案: src/lib/offlineApi.js
 *
 * v3.0：共用表樂觀鎖支援（version 欄位不在本地遞增，由 sync push 時檢查）
 * v2.0：私人表自動帶 user_id
 * v1.0：初版
 */

import db from './offlineDb'
import { supabase } from './supabase'

const PRIVATE_TABLES = ['daily_logs', 'work_items', 'maintenance_records', 'repair_orders']
const SHARED_TABLES = ['clients', 'projects', 'devices']

/**
 * 取得當前使用者 ID
 */
export async function getCurrentUserId() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.id) throw new Error('未登入')
  return session.user.id
}

/**
 * 讀取整張表（可篩選）
 */
export async function getAll(table, filters = {}, orderBy = null) {
  let collection = db[table].toCollection()

  const entries = Object.entries(filters)
  if (entries.length > 0) {
    const [firstKey, firstVal] = entries[0]
    collection = db[table].where(firstKey).equals(firstVal)

    if (entries.length > 1) {
      collection = collection.filter((row) =>
        entries.slice(1).every(([k, v]) => row[k] === v)
      )
    }
  }

  let results = await collection.toArray()

  if (orderBy) {
    const { field, ascending = true } = orderBy
    results.sort((a, b) => {
      const va = a[field] ?? ''
      const vb = b[field] ?? ''
      if (va < vb) return ascending ? -1 : 1
      if (va > vb) return ascending ? 1 : -1
      return 0
    })
  }

  return results
}

/**
 * 讀取單筆
 */
export async function getOne(table, id) {
  return await db[table].get(id)
}

/**
 * 新增（私人表自動帶 user_id）
 */
export async function create(table, data) {
  const now = new Date().toISOString()
  const record = {
    id: crypto.randomUUID(),
    ...data,
    created_at: now,
    updated_at: now,
    _dirty: 1,
  }

  // 私人表自動帶 user_id
  if (PRIVATE_TABLES.includes(table) && !record.user_id) {
    record.user_id = await getCurrentUserId()
  }

  // 共用表新增時 version = 1
  if (SHARED_TABLES.includes(table) && !record.version) {
    record.version = 1
  }

  await db[table].put(record)
  return record
}

/**
 * 更新
 * 共用表：本地不遞增 version，保留原值（sync push 時用來做衝突檢查）
 */
export async function update(table, id, updates) {
  const now = new Date().toISOString()
  const existing = await db[table].get(id)
  if (!existing) throw new Error(`${table} 找不到 id=${id}`)

  const updated = {
    ...existing,
    ...updates,
    updated_at: now,
    _dirty: 1,
  }
  await db[table].put(updated)
  return updated
}

/**
 * 刪除
 */
export async function remove(table, id) {
  await db[table].delete(id)
  await db.delete_queue.add({
    table_name: table,
    record_id: id,
    created_at: new Date().toISOString(),
  })
}

/**
 * 批次寫入關聯表（先清再建）
 */
export async function replaceJoin(table, parentKey, parentId, rows) {
  const existing = await db[table].where(parentKey).equals(parentId).toArray()
  for (const row of existing) {
    const key = table === 'project_clients'
      ? [row.project_id, row.client_id]
      : [row.project_id, row.device_id]
    await db[table].delete(key)
  }

  if (rows && rows.length > 0) {
    const now = new Date().toISOString()
    const newRows = rows.map((r) => ({
      ...r,
      created_at: now,
      _dirty: 1,
    }))
    await db[table].bulkPut(newRows)
  }
}
