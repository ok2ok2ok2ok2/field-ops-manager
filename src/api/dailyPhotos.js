/**
 * 工作日誌照片 API — 不開新資料表，直接用 Storage 資料夾
 * 版本: v1.0
 * 日期: 2026-11-02
 * 檔案: src/api/dailyPhotos.js
 *
 * 路徑：project-attachments/daily/<user_id>/<yyyy-MM-dd>/<timestamp>.jpg
 * 用「人＋日期」當資料夾而不是 log id：還沒寫日誌也能先拍。
 * 線上版跑自架 Supabase，開新表要到公司那台跑 migration；用資料夾就不用。
 * 必須在線上（不走離線佇列）。
 */

import { supabase } from '../lib/supabase'

const BUCKET = 'project-attachments'

function folder(userId, dateStr) {
  return `daily/${userId}/${dateStr}`
}

function publicUrl(path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/** 列出某人某天的照片，依上傳時間排序 → [{ path, url, name }] */
export async function listDailyPhotos(userId, dateStr) {
  const dir = folder(userId, dateStr)
  const { data, error } = await supabase.storage.from(BUCKET).list(dir, {
    limit: 200, sortBy: { column: 'name', order: 'asc' },
  })
  if (error) throw error
  return (data || [])
    .filter((f) => f.name && !f.name.startsWith('.'))
    .map((f) => ({ path: `${dir}/${f.name}`, url: publicUrl(`${dir}/${f.name}`), name: f.name }))
}

/** 上傳一張（呼叫端先 shrinkImage）→ { path, url, name } */
export async function uploadDailyPhoto(file, userId, dateStr) {
  const path = `${folder(userId, dateStr)}/${Date.now()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg' })
  if (error) throw error
  return { path, url: publicUrl(path), name: file.name }
}

export async function deleteDailyPhoto(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}
