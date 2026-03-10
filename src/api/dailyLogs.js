/**
 * 每日日誌 API — 離線版
 * 版本: v3.0
 * 日期: 2026-03-10
 * 檔案: src/api/dailyLogs.js
 *
 * v3.0：改為讀寫 IndexedDB
 */

import { getAll, getOne, create, update, remove } from '../lib/offlineApi'

const TABLE = 'daily_logs'

/** 讀取指定月份的日誌 */
export async function getLogsByMonth(year, month) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endMonth = month === 12 ? 1 : month + 1
  const endYear = month === 12 ? year + 1 : year
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`

  const all = await getAll(TABLE)
  return all
    .filter((log) => log.log_date >= startDate && log.log_date < endDate)
    .sort((a, b) => a.log_date.localeCompare(b.log_date))
}

/** 讀取指定日期範圍的日誌（週視圖用） */
export async function getLogsByRange(startDate, endDate) {
  const all = await getAll(TABLE)
  return all
    .filter((log) => log.log_date >= startDate && log.log_date <= endDate)
    .sort((a, b) => a.log_date.localeCompare(b.log_date))
}

/** 讀取單日日誌 */
export async function getLogByDate(dateStr) {
  const all = await getAll(TABLE)
  return all.find((log) => log.log_date === dateStr) || null
}

/** 新增日誌 */
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