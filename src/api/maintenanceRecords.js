/**
 * 維護記錄 API — 地動儀系統現場維護表
 * 版本: v1.3
 * 日期: 2026-06-26
 * 檔案: src/api/maintenanceRecords.js
 *
 * v1.3 變更：
 *  - 加入 type 欄位 ('定期' | '機動') 與 photo_slots (jsonb) 支援
 *  - 新增 getLatestAdHocSlots()：取最近一筆機動紀錄的格位設定 (模板用)
 *
 * 直接走 Supabase（不走離線同步，維護記錄需要上傳照片）
 */

import { supabase } from '../lib/supabase'

const TABLE = 'maintenance_records'
const BUCKET = 'project-attachments'

/* ========== CRUD ========== */

/** 讀取所有維護記錄；可選 type ('定期'|'機動') 在 server-side 過濾 */
export async function getMaintenanceRecords({ type } = {}) {
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('maintenance_date', { ascending: false })

  if (type) query = query.eq('type', type)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

/** 讀取單一維護記錄 */
export async function getRecord(id) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

/** 新增維護記錄；機動版需傳 type:'機動' 與 photo_slots */
export async function createRecord(record) {
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id

  const payload = {
    station_name: record.station_name || '',
    maintenance_date: record.maintenance_date,
    technician_img: record.technician_img || null,
    supervisor_img: record.supervisor_img || null,
    description: record.description || '',
    notes: record.notes || '',
    status_fields: record.status_fields || {},
    photos: record.photos || {},
    user_id: userId,
  }
  if (record.type) payload.type = record.type
  if (record.photo_slots !== undefined) payload.photo_slots = record.photo_slots

  const { data, error } = await supabase
    .from(TABLE)
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data
}

/** 更新維護記錄；機動版會帶 photo_slots */
export async function updateRecord(id, updates) {
  const payload = {
    station_name: updates.station_name,
    maintenance_date: updates.maintenance_date,
    technician_img: updates.technician_img ?? null,
    supervisor_img: updates.supervisor_img ?? null,
    description: updates.description,
    notes: updates.notes,
    status_fields: updates.status_fields,
    photos: updates.photos,
  }
  if (updates.photo_slots !== undefined) payload.photo_slots = updates.photo_slots

  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/** 刪除維護記錄 */
export async function deleteRecord(id) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)

  if (error) throw error
}

/* ========== 站名清單 ========== */

/** 從地動儀專案取站名清單（用於 datalist 自動補全） */
export async function getStationNames() {
  const { data, error } = await supabase
    .from('projects')
    .select('title')
    .eq('type', '地動儀')
    .eq('archived', false)
    .order('title')

  if (error) throw error
  // 去重 + 過濾空值
  const names = [...new Set((data || []).map((p) => p.title).filter(Boolean))]
  return names
}

/* ========== 機動維護模板 ========== */

/** 取最近一筆機動紀錄的 photo_slots，新增時當預設模板用 */
export async function getLatestAdHocSlots() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('photo_slots')
    .eq('type', '機動')
    .not('photo_slots', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw error
  return (data && data[0]?.photo_slots) || []
}

/* ========== 照片上傳 ========== */

/**
 * 上傳簽名圖片到 Supabase Storage
 * @param {File} file
 * @param {string} recordId
 * @param {'technician'|'supervisor'} role
 * @returns {{ url: string, name: string }}
 */
export async function uploadSignatureImage(file, recordId, role) {
  const timestamp = Date.now()
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `maintenance/${recordId}/sig_${role}_${timestamp}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type })

  if (error) throw error

  const { data } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path)

  return { url: data.publicUrl, name: file.name }
}

/**
 * 上傳維護照片到 Supabase Storage
 * @param {File} file - 檔案
 * @param {string} recordId - 維護記錄 ID（或暫用 'temp'）
 * @returns {{ url: string, name: string }}
 */
export async function uploadMaintenancePhoto(file, recordId) {
  const timestamp = Date.now()
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `maintenance/${recordId}/${timestamp}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type })

  if (error) throw error

  const { data } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path)

  return {
    url: data.publicUrl,
    name: file.name,
  }
}

/**
 * 刪除維護照片
 * @param {string} url - 照片公開 URL
 */
export async function deleteMaintenancePhoto(url) {
  const bucketUrl = `/storage/v1/object/public/${BUCKET}/`
  const idx = url.indexOf(bucketUrl)
  if (idx === -1) return

  const path = decodeURIComponent(url.substring(idx + bucketUrl.length))
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([path])

  if (error) throw error
}
