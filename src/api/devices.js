/**
 * 設備管理 API (Supabase)
 * 版本: v1.1
 * 日期: 2025-03-04
 * 檔案: src/api/devices.js
 *
 * v1.1 修改：
 *  - createDevice / updateDevice 支援 client_id
 *  - 新增 getDevicesByClientId()
 */

import { supabase } from '../lib/supabase'

/** 讀取所有設備 */
export async function getDevices() {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data
}

/** 讀取單一設備 */
export async function getDevice(id) {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

/** 依客戶 ID 讀取設備 */
export async function getDevicesByClientId(clientId) {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .eq('client_id', clientId)
    .order('device_code', { ascending: true })

  if (error) throw error
  return data || []
}

/** 新增設備 */
export async function createDevice(device) {
  const { data, error } = await supabase
    .from('devices')
    .insert({
      name: device.name,
      device_code: device.device_code || null,
      model: device.model || null,
      location: device.location || null,
      purchase_date: device.purchase_date || null,
      status: device.status || '正常',
      notes: device.notes || null,
      client_id: device.client_id || null,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/** 更新設備 */
export async function updateDevice(id, updates) {
  const { data, error } = await supabase
    .from('devices')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/** 刪除設備 */
export async function deleteDevice(id) {
  const { error } = await supabase
    .from('devices')
    .delete()
    .eq('id', id)

  if (error) throw error
}
