/**
 * 設備管理 API — 離線版
 * 版本: v2.0
 * 日期: 2026-03-10
 * 檔案: src/api/devices.js
 *
 * v2.0：改為讀寫 IndexedDB
 */

import { getAll, getOne, create, update, remove } from '../lib/offlineApi'

const TABLE = 'devices'

/** 讀取所有設備 */
export async function getDevices() {
  return await getAll(TABLE, {}, { field: 'updated_at', ascending: false })
}

/** 讀取單一設備 */
export async function getDevice(id) {
  return await getOne(TABLE, id)
}

/** 依客戶 ID 讀取設備 */
export async function getDevicesByClientId(clientId) {
  const data = await getAll(TABLE, { client_id: clientId })
  return data.sort((a, b) =>
    (a.device_code || '').localeCompare(b.device_code || '')
  )
}

/** 新增設備 */
export async function createDevice(device) {
  return await create(TABLE, {
    name: device.name,
    device_code: device.device_code || null,
    model: device.model || null,
    location: device.location || null,
    purchase_date: device.purchase_date || null,
    status: device.status || '正常',
    notes: device.notes || null,
    client_id: device.client_id || null,
  })
}

/** 更新設備 */
export async function updateDevice(id, updates) {
  return await update(TABLE, id, updates)
}

/** 刪除設備 */
export async function deleteDevice(id) {
  await remove(TABLE, id)
}