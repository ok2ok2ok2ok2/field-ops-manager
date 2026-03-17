/**
 * 每日日誌 API — 離線版
 * 版本: v4.0
 * 日期: 2026-03-16
 * 檔案: src/api/dailyLogs.js
 *
 * v4.0：所有查詢加 user_id 篩選（多使用者）
 *       create 不需手動帶 user_id（offlineApi 自動處理）
 * v3.0：改為讀寫 IndexedDB
 */

import { getAll, getOne, create, update, remove, getCurrentUserId } from '../lib/offlineApi'

const TABLE = 'daily_logs'

/** 讀取指定月份的日誌（當前使用者） */
export async function getLogsByMonth(year, month) {
  const uid = await getCurrentUserId()
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endMonth = month === 12 ? 1 : month + 1
  const endYear = month === 12 ? year + 1 : year
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`

  const all = await getAll(TABLE)
  return all
    .filter((log) => log.user_id === uid && log.log_date >= startDate && log.log_date < endDate)
    .sort((a, b) => a.log_date.localeCompare(b.log_date))
}

/** 讀取指定日期範圍的日誌（週視圖用） */
export async function getLogsByRange(startDate, endDate) {
  const uid = await getCurrentUserId()
  const all = await getAll(TABLE)
  return all
    .filter((log) => log.user_id === uid && log.log_date >= startDate && log.log_date <= endDate)
    .sort((a, b) => a.log_date.localeCompare(b.log_date))
}

/** 讀取單日日誌（當前使用者） */
export async function getLogByDate(dateStr) {
  const uid = await getCurrentUserId()
  const all = await getAll(TABLE)
  return all.find((log) => log.user_id === uid && log.log_date === dateStr) || null
}

/** 新增日誌（user_id 由 offlineApi.create 自動帶入） */
export async function createLog(log) {
  return await create(TABLE, {
    log_date: log.log_date,
    work_type: log.work_type || '外勤',
    work_summary: log.work_summary || null,
    field_start: log.field_start || null,
    field_end: log.field_end || null,
    field_hours: log.field_hours || null,
    field_locations: log.field_locations || [],
  })
}

/** 更新日誌 */
export async function updateLog(id, updates) {
  const { work_items, ...logUpdates } = updates
  return await update(TABLE, id, logUpdates)
}

/** 刪除日誌 */
export async function deleteLog(id) {
  await remove(TABLE, id)
}
