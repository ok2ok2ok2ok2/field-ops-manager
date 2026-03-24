/**
 * 維護記錄 API — 地動儀系統現場維護表
 * 版本: v1.1
 * 日期: 2026-03-23
 * 檔案: src/api/maintenanceRecords.js
 *
 * v1.1 變更：
 *  - 移除 device_id（地動儀維護表不綁設備）
 *  - select 移除 devices join
 *  - 新增 getStationNames()：從 projects type='地動儀' 取站名清單
 *
 * 直接走 Supabase（不走離線同步，維護記錄需要上傳照片）
 */

import { supabase } from '../lib/supabase'

const TABLE = 'maintenance_records'
const BUCKET = 'project-attachments'

/* ========== CRUD ========== */

/** 讀取所有維護記錄 */
export async function getMaintenanceRecords() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('maintenance_date', { ascending: false })

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

/** 新增維護記錄 */
export async function createRecord(record) {
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      station_name: record.station_name || '',
      maintenance_date: record.maintenance_date,
      technician: record.technician || '',
      supervisor: record.supervisor || '',
      description: record.description || '',
      notes: record.notes || '',
      status_fields: record.status_fields || {},
      photos: record.photos || {},
      user_id: userId,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/** 更新維護記錄 */
export async function updateRecord(id, updates) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      station_name: updates.station_name,
      maintenance_date: updates.maintenance_date,
      technician: updates.technician,
      supervisor: updates.supervisor,
      description: updates.description,
      notes: updates.notes,
      status_fields: updates.status_fields,
      photos: updates.photos,
    })
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

/* ========== 照片上傳 ========== */

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
