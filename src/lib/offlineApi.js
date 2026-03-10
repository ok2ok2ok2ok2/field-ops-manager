/**
 * 離線 API 工具層 — 統一的 IndexedDB CRUD
 * 版本: v1.0
 * 日期: 2026-03-10
 * 檔案: src/lib/offlineApi.js
 *
 * 說明：所有 API 檔案改為呼叫此工具進行本地讀寫
 *       寫入時自動標記 _dirty=1
 *       有網路時由 syncManager 負責推送
 */

import db from './offlineDb'

/**
 * 讀取整張表（可篩選）
 * @param {string} table - 表名
 * @param {Object} filters - { 欄位: 值 } 篩選條件
 * @param {Object} orderBy - { field, ascending }
 */
export async function getAll(table, filters = {}, orderBy = null) {
  let collection = db[table].toCollection()

  // 套用篩選
  const entries = Object.entries(filters)
  if (entries.length > 0) {
    const [firstKey, firstVal] = entries[0]
    collection = db[table].where(firstKey).equals(firstVal)

    // 多重篩選用 filter
    if (entries.length > 1) {
      collection = collection.filter((row) =>
        entries.slice(1).every(([k, v]) => row[k] === v)
      )
    }
  }

  let results = await collection.toArray()

  // 排序
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
 * 新增（自動產生 UUID + 時間戳記 + dirty 標記）
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
  await db[table].put(record)
  return record
}

/**
 * 更新
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
 * 刪除（本地刪除 + 加入刪除佇列等上線同步）
 */
export async function remove(table, id) {
  await db[table].delete(id)
  // 記錄到刪除佇列
  await db.delete_queue.add({
    table_name: table,
    record_id: id,
    created_at: new Date().toISOString(),
  })
}

/**
 * 批次寫入關聯表（先清再建）
 * @param {string} table - 關聯表名
 * @param {string} parentKey - 主鍵欄位名 (如 'project_id')
 * @param {string} parentId - 主鍵值
 * @param {Array} rows - 新的關聯資料
 */
export async function replaceJoin(table, parentKey, parentId, rows) {
  // 清除該 parent 的舊關聯
  const existing = await db[table].where(parentKey).equals(parentId).toArray()
  for (const row of existing) {
    const key = table === 'project_clients'
      ? [row.project_id, row.client_id]
      : [row.project_id, row.device_id]
    await db[table].delete(key)
  }

  // 寫入新關聯
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