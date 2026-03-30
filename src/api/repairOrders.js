/**
 * 送修單 API — 離線版
 * 版本: v1.0
 * 日期: 2026-03-25
 * 檔案: src/api/repairOrders.js
 *
 * v1.0：初版，CRUD + 全員查詢（boss/admin）
 */

import { getAll, getOne, create, update, remove, getCurrentUserId } from '../lib/offlineApi'
import db from '../lib/offlineDb'

const TABLE = 'repair_orders'

/* ========== 內部工具：附加設備+客戶資訊 ========== */

async function attachDevice(order) {
  if (!order.device_id) return { ...order, device: null }
  const device = await db.devices.get(order.device_id)
  if (!device) return { ...order, device: null }

  let client = null
  if (device.client_id) {
    client = await db.clients.get(device.client_id)
  }

  return {
    ...order,
    device: {
      id: device.id,
      name: device.name,
      device_code: device.device_code,
      model: device.model,
      client_id: device.client_id,
      client_name: client?.name || '',
    },
  }
}

async function attachDeviceToList(orders) {
  return await Promise.all(orders.map(attachDevice))
}

/* ========== 當前使用者查詢 ========== */

/** 讀取當前使用者的所有送修單 */
export async function getRepairOrders() {
  const uid = await getCurrentUserId()
  const data = await getAll(TABLE, {}, { field: 'repair_date', ascending: false })
  const filtered = data.filter((i) => i.user_id === uid)
  return await attachDeviceToList(filtered)
}

/** 依設備 ID 讀取送修記錄 */
export async function getRepairOrdersByDevice(deviceId) {
  const uid = await getCurrentUserId()
  const data = await getAll(TABLE, { device_id: deviceId })
  const filtered = data.filter((i) => i.user_id === uid)
  filtered.sort((a, b) => (b.repair_date || '').localeCompare(a.repair_date || ''))
  return await attachDeviceToList(filtered)
}

/* ========== 全員查詢（boss/admin） ========== */

/** 讀取全員送修單（可選 userId 篩選） */
export async function getAllUsersRepairOrders(userId = null) {
  const data = await getAll(TABLE, {}, { field: 'repair_date', ascending: false })
  const filtered = userId ? data.filter((i) => i.user_id === userId) : data
  return await attachDeviceToList(filtered)
}

/* ========== CRUD ========== */

/** 新增送修單 */
export async function createRepairOrder(order) {
  const record = await create(TABLE, {
    device_id: order.device_id || null,
    repair_date: order.repair_date || new Date().toISOString().substring(0, 10),
    client_name: order.client_name || '',
    product_name: order.product_name || '',
    model_name: order.model_name || '',
    reason: order.reason || '',
    notes: order.notes || '',
    attachments: order.attachments || '[]',
  })
  return await attachDevice(record)
}

/** 更新送修單 */
export async function updateRepairOrder(id, updates) {
  const record = await update(TABLE, id, updates)
  return await attachDevice(record)
}

/** 刪除送修單 */
export async function deleteRepairOrder(id) {
  await remove(TABLE, id)
}
