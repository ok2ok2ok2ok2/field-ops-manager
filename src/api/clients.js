/**
 * 客戶管理 API — 離線版
 * 版本: v2.0
 * 日期: 2026-03-10
 * 檔案: src/api/clients.js
 *
 * v2.0：改為讀寫 IndexedDB，由 syncManager 同步到 Supabase
 */

import { getAll, getOne, create, update, remove } from '../lib/offlineApi'

const TABLE = 'clients'

/** 讀取所有客戶 */
export async function getClients() {
  const data = await getAll(TABLE)
  // 排序：category → name
  return data.sort((a, b) => {
    const ca = (a.category || '').localeCompare(b.category || '', 'zh-TW')
    if (ca !== 0) return ca
    return (a.name || '').localeCompare(b.name || '', 'zh-TW')
  })
}

/** 讀取單一客戶 */
export async function getClient(id) {
  return await getOne(TABLE, id)
}

/** 新增客戶 */
export async function createClient(client) {
  return await create(TABLE, {
    name: client.name,
    category: client.category || null,
    contact_name: client.contact_name || null,
    phone: client.phone || null,
    email: client.email || null,
    contact_notes: client.contact_notes || null,
    payment_date: client.payment_date || null,
    payment_notes: client.payment_notes || null,
    device_count: client.device_count || 0,
    device_codes: client.device_codes || [],
    notes: client.notes || null,
  })
}

/** 更新客戶 */
export async function updateClient(id, updates) {
  return await update(TABLE, id, updates)
}

/** 刪除客戶 */
export async function deleteClient(id) {
  await remove(TABLE, id)
}