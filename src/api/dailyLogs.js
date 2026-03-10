/**
 * 每日日誌 API (Supabase)
 * 版本: v2.0
 * 日期: 2026-03-06
 * 檔案: src/api/dailyLogs.js
 *
 * v2.0 重構：
 *  - work_items 相關函數全部搬到 workItems.js
 *  - 此檔僅保留日誌本身的 CRUD
 */

import { supabase } from '../lib/supabase'

/* ========== 日誌 CRUD ========== */

/** 讀取指定月份的日誌 */
export async function getLogsByMonth(year, month) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endMonth = month === 12 ? 1 : month + 1
  const endYear = month === 12 ? year + 1 : year
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`

  const { data, error } = await supabase
    .from('daily_logs')
    .select('*')
    .gte('log_date', startDate)
    .lt('log_date', endDate)
    .order('log_date', { ascending: true })

  if (error) throw error
  return data
}

/** 讀取指定日期範圍的日誌（週視圖用） */
export async function getLogsByRange(startDate, endDate) {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('*')
    .gte('log_date', startDate)
    .lte('log_date', endDate)
    .order('log_date', { ascending: true })

  if (error) throw error
  return data
}

/** 讀取單日日誌 */
export async function getLogByDate(dateStr) {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('log_date', dateStr)
    .maybeSingle()

  if (error) throw error
  return data
}

/** 新增日誌 */
export async function createLog(log) {
  const { data, error } = await supabase
    .from('daily_logs')
    .insert({
      log_date: log.log_date,
      work_type: log.work_type || '外勤',
      work_summary: log.work_summary || null,
      field_start: log.field_start || null,
      field_end: log.field_end || null,
      field_hours: log.field_hours || null,
      field_locations: log.field_locations || [],
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/** 更新日誌 */
export async function updateLog(id, updates) {
  const { work_items, ...logUpdates } = updates
  const { data, error } = await supabase
    .from('daily_logs')
    .update(logUpdates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/** 刪除日誌（work_items 會因 CASCADE 自動刪除） */
export async function deleteLog(id) {
  const { error } = await supabase
    .from('daily_logs')
    .delete()
    .eq('id', id)

  if (error) throw error
}
