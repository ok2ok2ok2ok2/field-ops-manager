/**
 * 月報表拆解 — 把 daily_logs 拆成公差單 + 加班表兩份資料
 * 版本: v0.1.0
 * 日期: 2026-07-08
 * 檔案: src/lib/monthlyReport.js
 *
 * 規則常數集中在頂端方便微調。
 */

/* ========== 可調規則常數 ========== */
export const RULES = {
  WORK_START: '08:30',
  WORK_END:   '17:30',
  MEAL_PRICE: 200,
  EARLY_MEAL_BEFORE: '07:00',   // 上班早於此 → 早餐
  LUNCH_COVER_START: '12:00',   // 外勤跨過 12:00–13:00 → 午餐
  LUNCH_COVER_END:   '13:00',
  DINNER_AFTER: '19:00',        // 下班晚於此 → 晚餐
}

/* ========== 小工具 ========== */
export function toMinutes(hhmm) {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function toHhmm(mins) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function rocYear(dateStr) {
  return Number(dateStr.slice(0, 4)) - 1911
}

export function weekdayNum(dateStr) {
  return new Date(`${dateStr}T00:00:00`).getDay() // 0=日 6=六
}

export function hoursBetween(startHhmm, endHhmm) {
  const s = toMinutes(startHhmm)
  const e = toMinutes(endHhmm)
  if (s == null || e == null || e <= s) return 0
  return Math.round(((e - s) / 60) * 100) / 100
}

/* ========== 誤餐費計算 ========== */
export function calcMealFee(startHhmm, endHhmm, rules = RULES) {
  const s = toMinutes(startHhmm)
  const e = toMinutes(endHhmm)
  if (s == null || e == null) return { count: 0, fee: 0, tags: [] }

  const tags = []
  if (s < toMinutes(rules.EARLY_MEAL_BEFORE)) tags.push('早')
  if (s <= toMinutes(rules.LUNCH_COVER_START) && e >= toMinutes(rules.LUNCH_COVER_END)) tags.push('午')
  if (e > toMinutes(rules.DINNER_AFTER)) tags.push('晚')

  return { count: tags.length, fee: tags.length * rules.MEAL_PRICE, tags }
}

/* ========== 加班時段切分 ========== */
export function splitOvertime(startHhmm, endHhmm, rules = RULES) {
  const s = toMinutes(startHhmm)
  const e = toMinutes(endHhmm)
  const wStart = toMinutes(rules.WORK_START)
  const wEnd = toMinutes(rules.WORK_END)
  const segs = []
  if (s == null || e == null) return segs

  if (s < wStart) {
    segs.push({ start: toHhmm(s), end: toHhmm(Math.min(e, wStart)), position: 'early' })
  }
  if (e > wEnd) {
    segs.push({ start: toHhmm(Math.max(s, wEnd)), end: toHhmm(e), position: 'late' })
  }
  return segs.filter((seg) => toMinutes(seg.end) > toMinutes(seg.start))
}

/* ========== 加班分類 (對應加班表 6 個欄位) ========== */
// U=上班日前2 / V=上班日2+ / W=周六前2 / X=周六3-8 / Y=周六8+ / Z=周日
export function classifyOvertime(dateStr, hours) {
  const dow = weekdayNum(dateStr)
  if (dow === 0) return [{ column: 'sunday', hours }]
  if (dow === 6) {
    const parts = []
    let remaining = hours
    const take = (n) => { const t = Math.min(remaining, n); remaining -= t; return t }
    const h1 = take(2)
    if (h1 > 0) parts.push({ column: 'sat_2', hours: h1 })
    const h2 = take(6)
    if (h2 > 0) parts.push({ column: 'sat_3to8', hours: h2 })
    if (remaining > 0) parts.push({ column: 'sat_8plus', hours: remaining })
    return parts
  }
  const parts = []
  let remaining = hours
  const h1 = Math.min(remaining, 2); remaining -= h1
  if (h1 > 0) parts.push({ column: 'weekday_2', hours: h1 })
  if (remaining > 0) parts.push({ column: 'weekday_after2', hours: remaining })
  return parts
}

/* ========== 主拆解函數 ========== */
/**
 * @param {Array} logs - daily_logs, 需有 log_date, field_start, field_end, field_locations, work_summary, work_items
 * @returns {{ businessTrips: Array, overtimes: Array, totals: object }}
 *
 * businessTrips 每筆:
 *   { log_date, roc_year, start_hhmm, end_hhmm, hours, remark, meal_fee, meal_tags }
 * overtimes 每筆:
 *   { log_date, roc_year, start_hhmm, end_hhmm, hours, remark, project, breakdown: [{column, hours}] }
 */
export function buildReport(logs, rules = RULES) {
  const businessTrips = []
  const overtimes = []

  const sorted = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date))
  for (const log of sorted) {
    if (!log.field_start || !log.field_end) continue
    if (log.work_type !== '外勤' && log.work_type !== '內勤+外勤') continue

    const start = log.field_start.substring(0, 5)
    const end = log.field_end.substring(0, 5)
    const total_hours = hoursBetween(start, end)
    const remark = pickRemark(log)
    const meal = calcMealFee(start, end, rules)

    businessTrips.push({
      log_date: log.log_date,
      roc_year: rocYear(log.log_date),
      start_hhmm: start,
      end_hhmm: end,
      hours: total_hours,
      remark,
      meal_fee: meal.fee,
      meal_tags: meal.tags,
    })

    const otSegs = splitOvertime(start, end, rules)
    for (const seg of otSegs) {
      const hrs = hoursBetween(seg.start, seg.end)
      if (hrs <= 0) continue
      overtimes.push({
        log_date: log.log_date,
        roc_year: rocYear(log.log_date),
        start_hhmm: seg.start,
        end_hhmm: seg.end,
        hours: hrs,
        position: seg.position,
        remark,
        project: pickProject(log),
        breakdown: classifyOvertime(log.log_date, hrs),
      })
    }
  }

  const totals = {
    business_meal_fee: businessTrips.reduce((s, t) => s + t.meal_fee, 0),
    business_hours: businessTrips.reduce((s, t) => s + t.hours, 0),
    overtime_hours: overtimes.reduce((s, t) => s + t.hours, 0),
  }

  return { businessTrips, overtimes, totals }
}

function pickRemark(log) {
  const locs = Array.isArray(log.field_locations) ? log.field_locations.filter(Boolean) : []
  if (locs.length > 0) return locs.join(' / ')
  if (log.work_summary) return log.work_summary
  return ''
}

function pickProject(log) {
  const items = Array.isArray(log.work_items) ? log.work_items : []
  const names = items.map((it) => it.name).filter(Boolean)
  if (names.length > 0) return names.join(' / ')
  return log.work_summary || ''
}
