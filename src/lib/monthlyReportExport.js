/**
 * 月報表匯出 — 用 ExcelJS 讀範本 xlsx, 填資料, 觸發下載
 * 版本: v0.2.0
 * 日期: 2026-07-09
 * 檔案: src/lib/monthlyReportExport.js
 *
 * v0.2.0: 改用 ExcelJS (SheetJS Community 版寫回會展開 XFD 欄, styles 大量流失)
 *
 * 範本: public/templates/business_trip.xlsx  &  overtime.xlsx
 * 只改資料格 .value, 保留 style / merge / 公式 (Z17 SUM / Y18=B3)
 */

// ExcelJS 在函數內 dynamic import, 避免進主 bundle
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
  const buf = await res.arrayBuffer()
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  return wb
}

function setCell(ws, addr, value) {
  if (value === '' || value == null) return
  ws.getCell(addr).value = value
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

async function downloadWorkbook(wb, filename) {
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ========== 公差單 ========== */
export async function exportBusinessTrip(applicant, trips) {
  const wb = await loadTemplate(TEMPLATE_TRIP)
  const ws = wb.worksheets[0]

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
    setCell(ws, `L${r}`, sm)
    setCell(ws, `N${r}`, sd)
    setCell(ws, `P${r}`, eh)
    setCell(ws, `R${r}`, emm)
    setCell(ws, `T${r}`, 0)
    setCell(ws, `V${r}`, Number(t.hours) || 0)
    setCell(ws, `X${r}`, t.remark || '')
    setCell(ws, `Z${r}`, Number(t.meal_fee) || 0)
  }

  const y = trips[0]?.log_date?.slice(0, 4) || ''
  const m = Number(trips[0]?.log_date?.slice(5, 7)) || ''
  const name = applicant || '申請人'
  await downloadWorkbook(wb, `${y} ${name}${m}月公差單.xlsx`.trim())
}

/* ========== 加班表 ========== */
export async function exportOvertime(applicant, overtimes) {
  const wb = await loadTemplate(TEMPLATE_OT)
  const ws = wb.worksheets[0]

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

  const y = overtimes[0]?.log_date?.slice(0, 4) || ''
  const m = Number(overtimes[0]?.log_date?.slice(5, 7)) || ''
  const name = applicant || '申請人'
  await downloadWorkbook(wb, `${y} ${name}${m}月加班表.xlsx`.trim())
}
