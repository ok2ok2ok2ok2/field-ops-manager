/**
 * 公司共用日曆（維興專用）— 前端呼叫端
 * 版本: v1.0
 * 日期: 2026-11-02
 * 檔案: src/api/companyCalendar.js
 *
 * 打自己的 /api/calendar（Vercel serverless，用服務帳戶讀 Google 日曆）。
 * 回 [{ id, summary, location, startDate, endDate, startTime, endTime, allDay, creator }]
 *   startDate/endDate = 'YYYY-MM-DD'（endDate 含當天），時間 'HH:mm'（全天為 null）
 * ⚠ 本機 vite dev 沒有 /api，會回空陣列；要看真資料得部署後在線上測。
 */

import { supabase } from '../lib/supabase'

export async function getCompanyEvents(startISO, endISO) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return []
  const r = await fetch(`/api/calendar?start=${startISO}&end=${endISO}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const ct = r.headers.get('content-type') || ''
  if (!ct.includes('application/json')) return []   // 本機 dev 會拿到 index.html
  const body = await r.json()
  if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`)
  return body.events || []
}

/** 展開成 { 'YYYY-MM-DD': [event, ...] }，跨日行程每一天都放一份 */
export function groupEventsByDate(events) {
  const map = {}
  for (const ev of events || []) {
    let d = ev.startDate
    let guard = 0
    while (d && d <= ev.endDate && guard++ < 62) {
      ;(map[d] ||= []).push(ev)
      const t = new Date(`${d}T00:00:00`)
      t.setDate(t.getDate() + 1)
      d = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    }
  }
  return map
}
