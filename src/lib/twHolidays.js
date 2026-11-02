/**
 * 台灣國定假日／補班 — 行政機關辦公日曆表
 * 版本: v1.0
 * 日期: 2026-11-02
 * 檔案: src/lib/twHolidays.js
 *
 * 資料源：ruyut/TaiwanCalendar（整理自人事行政總處公告，data.gov.tw），走 jsDelivr CDN。
 * 2026-11-02 實測 2026.json 365 天、含新增的教師節 9/28、光復節 10/25 與補假。
 * 一年抓一次存 localStorage 7 天；抓不到就回空表（畫面照常，只是沒標假日）。
 *
 * parseCalendar：純函式（node --test：scripts/twHolidays.test.mjs）
 */

const SRC = (y) => `https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${y}.json`
const CACHE_KEY = (y) => `fieldops.twHolidays.${y}`
const TTL_MS = 7 * 24 * 3600 * 1000

/**
 * 只留「跟平常不一樣」的日子：有名稱的、平日放假、週末補班。
 * @param {Array<{date:string, week:string, isHoliday:boolean, description:string}>} rows
 * @returns {Object<string, {name:string, isHoliday:boolean}>} key = 'YYYY-MM-DD'
 */
export function parseCalendar(rows) {
  const out = {}
  for (const r of rows || []) {
    if (!/^\d{8}$/.test(r.date || '')) continue
    const weekend = r.week === '六' || r.week === '日'
    const desc = (r.description || '').trim()
    if (!desc && r.isHoliday === weekend) continue
    const key = `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6, 8)}`
    out[key] = { name: desc || (r.isHoliday ? '放假' : '補班'), isHoliday: !!r.isHoliday }
  }
  return out
}

/** 取某年的假日表（有快取）。 */
export async function getHolidays(year) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY(year)) || 'null')
    if (c && Date.now() - c.t < TTL_MS) return c.map
  } catch { /* 快取壞了就重抓 */ }
  try {
    const r = await fetch(SRC(year))
    if (!r.ok) return {}
    const map = parseCalendar(await r.json())
    try { localStorage.setItem(CACHE_KEY(year), JSON.stringify({ t: Date.now(), map })) } catch { /* 忽略 */ }
    return map
  } catch {
    return {}
  }
}
