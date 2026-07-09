/**
 * 月報表匯出 — 讀範本 xlsx, 填入資料, 產下載
 * 版本: v0.1.0
 * 日期: 2026-07-09
 * 檔案: src/lib/monthlyReportExport.js
 *
 * 範本: public/templates/business_trip.xlsx  &  overtime.xlsx
 * 只修改資料格 (row 6-16 / row 7-15) 的 .v, 保留範本原有 style / merge / 公式
 */

import * as XLSX from 'xlsx'

const TEMPLATE_TRIP = '/templates/business_trip.xlsx'
const TEMPLATE_OT   = '/templates/overtime.xlsx'

const TRIP_START_ROW = 6
const TRIP_MAX_ROWS  = 11  // row 6~16

const OT_START_ROW = 7
const OT_MAX_ROWS  = 9   // row 7~15

const OT_COL_MAP = {
  weekday_2:      'U',
  weekday_after2: 'V',
  sat_2:          'W',
  sat_3to8:       'X',
  sat_8plus:      'Y',
  sunday:         'Z',
}

async function loadTemplate(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`載入範本失敗 ${url}: HTTP ${res.status}`)
  const ab = await res.arrayBuffer()
  return XLSX.read(ab, { type: 'array', cellStyles: true })
}

function setCell(ws, addr, value) {
  if (value === '' || value == null) return
  const t = typeof value === 'number' ? 'n' : 's'
  if (ws[addr]) {
    ws[addr].v = value
    ws[addr].t = t
    delete ws[addr].w
  } else {
    ws[addr] = { v: value, t }
  }
}

function parseHhmm(s) {
  if (!s) return [null, null]
  const [h, m] = s.split(':').map(Number)
  return [h, m]
}

function rocYear(dateStr) {
  return Number(dateStr.slice(0, 4)) - 1911
}

function ymd(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return [y, m, d]
}

/* ========== 公差單 ========== */
export async function exportBusinessTrip(applicant, trips) {
  const wb = await loadTemplate(TEMPLATE_TRIP)
  const ws = wb.Sheets[wb.SheetNames[0]]

  if (applicant) setCell(ws, 'B3', applicant)

  const count = Math.min(trips.length, TRIP_MAX_ROWS)
  for (let i = 0; i < count; i++) {
    const t = trips[i]
    const r = TRIP_START_ROW + i
    const [, sm, sd] = ymd(t.log_date)
    const [sh, smm] = parseHhmm(t.start_hhmm)
    const [eh, emm] = parseHhmm(t.end_hhmm)
    const roc = rocYear(t.log_date)

    setCell(ws, `A${r}`, roc)
    setCell(ws, `C${r}`, sm)
    setCell(ws, `E${r}`, sd)
    setCell(ws, `G${r}`, sh)
    setCell(ws, `I${r}`, smm)
    setCell(ws, `L${r}`, sm)  // 終月 (同日)
    setCell(ws, `N${r}`, sd)  // 終日
    setCell(ws, `P${r}`, eh)
    setCell(ws, `R${r}`, emm)
    setCell(ws, `T${r}`, 0)
    setCell(ws, `V${r}`, Number(t.hours) || 0)
    setCell(ws, `X${r}`, t.remark || '')
    setCell(ws, `Z${r}`, Number(t.meal_fee) || 0)
  }

  const ym = trips[0]?.log_date?.substring(0, 7).replace('-', '') || 'YYYYMM'
  const name = applicant || '申請人'
  const filename = `${trips[0]?.log_date?.slice(0, 4) || ''} ${name}${Number(ym.slice(4)) || ''}月公差單.xlsx`
  XLSX.writeFile(wb, filename.trim())
}

/* ========== 加班表 ========== */
export async function exportOvertime(applicant, overtimes) {
  const wb = await loadTemplate(TEMPLATE_OT)
  const ws = wb.Sheets[wb.SheetNames[0]]

  if (applicant) setCell(ws, 'B3', applicant)

  const count = Math.min(overtimes.length, OT_MAX_ROWS)
  for (let i = 0; i < count; i++) {
    const o = overtimes[i]
    const r = OT_START_ROW + i
    const [, sm, sd] = ymd(o.log_date)
    const [sh, smm] = parseHhmm(o.start_hhmm)
    const [eh, emm] = parseHhmm(o.end_hhmm)
    const roc = rocYear(o.log_date)

    setCell(ws, `A${r}`, roc)
    setCell(ws, `C${r}`, sm)
    setCell(ws, `E${r}`, sd)
    setCell(ws, `G${r}`, sh)
    setCell(ws, `I${r}`, smm)
    setCell(ws, `L${r}`, eh)
    setCell(ws, `N${r}`, emm)
    setCell(ws, `P${r}`, Number(o.hours) || 0)
    setCell(ws, `S${r}`, o.remark || '')
    setCell(ws, `T${r}`, o.project || '')

    for (const b of o.breakdown || []) {
      const col = OT_COL_MAP[b.column]
      if (col) setCell(ws, `${col}${r}`, Number(b.hours) || 0)
    }
  }

  const ym = overtimes[0]?.log_date?.substring(0, 7).replace('-', '') || 'YYYYMM'
  const name = applicant || '申請人'
  const filename = `${overtimes[0]?.log_date?.slice(0, 4) || ''} ${name}${Number(ym.slice(4)) || ''}月加班表.xlsx`
  XLSX.writeFile(wb, filename.trim())
}
