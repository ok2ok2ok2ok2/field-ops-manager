/**
 * 月報表拆解 — 把 daily_logs 拆成公差單 + 加班表兩份資料
 * 版本: v0.3.0
 * 日期: 2026-10-06
 * 檔案: src/lib/monthlyReport.js
 *
 * 規則常數集中在頂端方便微調。
 *
 * v0.3.0: 抽出 recalcTrip / overtimeRowsForTrip, 公差單改時間可連動加班表 (_id / _src 對應)
 * v0.2.0: 加班級距改「同一天累計」(早+晚兩段共用前 2 小時額度);
 *         六日整段外勤都算加班 (原本只算 08:30–17:30 以外, 周六 9–17 會算成 0)
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
// 級距以「當天累計」計：同一天早上 1.5h + 晚上 1.5h → 前2 = 2、2+ = 1
const TIERS = {
  weekday:  [[2, 'weekday_2'], [Infinity, 'weekday_after2']],
  saturday: [[2, 'sat_2'], [8, 'sat_3to8'], [Infinity, 'sat_8plus']],
  sunday:   [[Infinity, 'sunday']],
}

export function isRestDay(dateStr) {
  const dow = weekdayNum(dateStr)
  return dow === 0 || dow === 6
}

/** usedBefore = 當天在這筆之前已累計的加班時數 */
export function classifyOvertime(dateStr, hours, usedBefore = 0) {
  if (!dateStr || !(hours > 0)) return []
  const dow = weekdayNum(dateStr)
  const tiers = dow === 0 ? TIERS.sunday : dow === 6 ? TIERS.saturday : TIERS.weekday
  const parts = []
  let pos = usedBefore
  let remaining = hours
  for (const [cap, column] of tiers) {
    if (remaining <= 0) break
    const room = cap - pos
    if (room <= 0) continue
    const t = Math.round(Math.min(room, remaining) * 100) / 100
    if (t > 0) parts.push({ column, hours: t })
    pos += t
    remaining = Math.round((remaining - t) * 100) / 100
  }
  return parts
}

/**
 * 依「同一天累計」重新分配 breakdown。
 * onlyDates 給了就只重算那幾天 (保留其他天的手動修改)。回傳新陣列, 不改順序。
 */
export function allocateBreakdowns(ots, onlyDates = null) {
  const byDate = {}
  ots.forEach((o, idx) => {
    if (!o.log_date) return
    if (onlyDates && !onlyDates.includes(o.log_date)) return
    ;(byDate[o.log_date] ||= []).push(idx)
  })
  const next = [...ots]
  for (const [date, idxs] of Object.entries(byDate)) {
    idxs.sort((a, b) => (ots[a].start_hhmm || '').localeCompare(ots[b].start_hhmm || ''))
    let used = 0
    for (const i of idxs) {
      const hrs = Number(ots[i].hours) || 0
      next[i] = { ...ots[i], breakdown: classifyOvertime(date, hrs, used) }
      used += hrs
    }
  }
  return next
}

/* ========== 公差列 → 加班列 ========== */
/** 公差單改了日期/起訖時, 重算該列時數與誤餐 */
export function recalcTrip(trip, rules = RULES) {
  const meal = calcMealFee(trip.start_hhmm, trip.end_hhmm, rules)
  return {
    ...trip,
    roc_year: trip.log_date ? rocYear(trip.log_date) : '',
    hours: hoursBetween(trip.start_hhmm, trip.end_hhmm),
    meal_fee: meal.fee,
    meal_tags: meal.tags,
  }
}

/** 一筆公差產生的加班列 (breakdown 留空, 由 allocateBreakdowns 依當天累計分配) */
export function overtimeRowsForTrip(trip, rules = RULES) {
  const { log_date, start_hhmm: start, end_hhmm: end } = trip
  if (!log_date || !start || !end) return []
  // 休假日 (六日) 整段外勤都算加班, 不扣午休; 上班日只算 08:30–17:30 以外
  const segs = isRestDay(log_date)
    ? [{ start, end, position: 'rest' }]
    : splitOvertime(start, end, rules)
  return segs
    .map((seg) => ({
      _src: trip._id,
      log_date,
      roc_year: rocYear(log_date),
      start_hhmm: seg.start,
      end_hhmm: seg.end,
      hours: hoursBetween(seg.start, seg.end),
      position: seg.position,
      remark: trip.remark || '',
      project: trip.project || '',
      breakdown: [],
    }))
    .filter((o) => o.hours > 0)
}

/** 依日期 + 起始時間排序 (加班表顯示與匯出順序) */
export function sortOts(ots) {
  return [...ots].sort((a, b) =>
    (a.log_date || '9999').localeCompare(b.log_date || '9999') ||
    (a.start_hhmm || '').localeCompare(b.start_hhmm || ''))
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

    const trip = {
      _id: `t${businessTrips.length}`,
      log_date: log.log_date,
      roc_year: rocYear(log.log_date),
      start_hhmm: start,
      end_hhmm: end,
      hours: total_hours,
      remark,
      project: pickProject(log),
      meal_fee: meal.fee,
      meal_tags: meal.tags,
    }
    businessTrips.push(trip)
    overtimes.push(...overtimeRowsForTrip(trip, rules))
  }

  const allocated = allocateBreakdowns(overtimes)

  const totals = {
    business_meal_fee: businessTrips.reduce((s, t) => s + t.meal_fee, 0),
    business_hours: businessTrips.reduce((s, t) => s + t.hours, 0),
    overtime_hours: overtimes.reduce((s, t) => s + t.hours, 0),
  }

  return { businessTrips, overtimes: allocated, totals }
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
