/**
 * 月報表 — 從 daily_logs 拆成公差單 + 加班表, 預覽 (Step 1 read-only)
 * 版本: v0.1.0
 * 日期: 2026-07-08
 * 檔案: src/pages/MonthlyReport.jsx
 *
 * TODO Step 2: 可編輯 (增列/刪列/改欄位)
 * TODO Step 3: 匯出 xlsx (以 public/templates/*.xlsx 當範本, SheetJS 填格)
 */

import { useMemo, useState } from 'react'
import { getLogsByMonth } from '../api/dailyLogs'
import { getWorkItemsByLogIds } from '../api/workItems'
import { buildReport, RULES } from '../lib/monthlyReport'

const now = new Date()
const DEFAULT_YEAR = now.getFullYear()
const DEFAULT_MONTH = now.getMonth() + 1

export default function MonthlyReport() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState(DEFAULT_MONTH)
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState([])
  const [errMsg, setErrMsg] = useState('')

  async function loadMonth() {
    setLoading(true)
    setErrMsg('')
    try {
      const raw = await getLogsByMonth(year, month)
      const logIds = raw.map((l) => l.id)
      const items = await getWorkItemsByLogIds(logIds)
      const itemMap = {}
      for (const it of items) {
        const k = it.log_id
        if (!itemMap[k]) itemMap[k] = []
        itemMap[k].push(it)
      }
      const enriched = raw.map((l) => ({ ...l, work_items: itemMap[l.id] || [] }))
      setLogs(enriched)
    } catch (e) {
      setErrMsg(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  const report = useMemo(() => buildReport(logs), [logs])

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="flex items-baseline gap-2 mb-3">
        <h1 className="text-xl font-bold">月報表匯出</h1>
        <span className="text-xs text-gray-500">v0.1.0 · 預覽拆解結果 (未含編輯/匯出)</span>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-white rounded shadow-sm p-3 mb-4">
        <label className="text-sm">
          西元年:
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="ml-1 w-20 border rounded px-1" />
        </label>
        <label className="text-sm">
          月:
          <input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))}
            className="ml-1 w-14 border rounded px-1" />
        </label>
        <button onClick={loadMonth} disabled={loading}
          className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:bg-gray-400">
          {loading ? '讀取中…' : '載入'}
        </button>
        <span className="ml-auto text-xs text-gray-500">
          規則: 上下班 {RULES.WORK_START}–{RULES.WORK_END} · 誤餐 ${RULES.MEAL_PRICE}/餐
        </span>
      </div>

      {errMsg && <div className="text-red-600 text-sm mb-2">錯誤: {errMsg}</div>}

      <BusinessTripSection trips={report.businessTrips} totalFee={report.totals.business_meal_fee} />
      <OvertimeSection ots={report.overtimes} totalHours={report.totals.overtime_hours} />

      {logs.length === 0 && !loading && (
        <div className="text-gray-400 text-sm mt-4">按「載入」選一個月份, 會撈當月 daily_logs 拆成兩張表</div>
      )}
    </div>
  )
}

function BusinessTripSection({ trips, totalFee }) {
  return (
    <section className="mb-6">
      <h2 className="font-semibold text-base mb-2 flex items-baseline gap-2">
        <span>公差單</span>
        <span className="text-xs text-gray-500">{trips.length} 筆 · 誤餐費合計 ${totalFee}</span>
      </h2>
      <div className="overflow-x-auto bg-white rounded shadow-sm">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">民國</th>
              <th className="p-2 text-left">日期</th>
              <th className="p-2">起</th>
              <th className="p-2">訖</th>
              <th className="p-2">時數</th>
              <th className="p-2 text-left">備註 (地點/事由)</th>
              <th className="p-2">誤餐</th>
              <th className="p-2">$</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((t, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{t.roc_year}</td>
                <td className="p-2">{t.log_date}</td>
                <td className="p-2 text-center font-mono">{t.start_hhmm}</td>
                <td className="p-2 text-center font-mono">{t.end_hhmm}</td>
                <td className="p-2 text-center">{t.hours}</td>
                <td className="p-2">{t.remark}</td>
                <td className="p-2 text-center text-gray-600">{t.meal_tags.join('') || '—'}</td>
                <td className="p-2 text-right">{t.meal_fee}</td>
              </tr>
            ))}
            {trips.length === 0 && (
              <tr><td colSpan={8} className="p-3 text-gray-400 text-center">無</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function OvertimeSection({ ots, totalHours }) {
  const colLabel = {
    weekday_2: '上班日前2', weekday_after2: '上班日2+',
    sat_2: '周六前2', sat_3to8: '周六3-8', sat_8plus: '周六8+',
    sunday: '周日',
  }
  return (
    <section>
      <h2 className="font-semibold text-base mb-2 flex items-baseline gap-2">
        <span>加班表</span>
        <span className="text-xs text-gray-500">{ots.length} 筆 · 時數合計 {totalHours}</span>
      </h2>
      <div className="overflow-x-auto bg-white rounded shadow-sm">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">民國</th>
              <th className="p-2 text-left">日期</th>
              <th className="p-2">起</th>
              <th className="p-2">訖</th>
              <th className="p-2">時數</th>
              <th className="p-2 text-left">分類</th>
              <th className="p-2 text-left">案子</th>
              <th className="p-2 text-left">備註</th>
            </tr>
          </thead>
          <tbody>
            {ots.map((o, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{o.roc_year}</td>
                <td className="p-2">{o.log_date}</td>
                <td className="p-2 text-center font-mono">{o.start_hhmm}</td>
                <td className="p-2 text-center font-mono">{o.end_hhmm}</td>
                <td className="p-2 text-center">{o.hours}</td>
                <td className="p-2">
                  {o.breakdown.map((b, j) => (
                    <span key={j} className="inline-block mr-1 px-1 rounded bg-blue-50 text-blue-800">
                      {colLabel[b.column]} {b.hours}h
                    </span>
                  ))}
                </td>
                <td className="p-2">{o.project}</td>
                <td className="p-2">{o.remark}</td>
              </tr>
            ))}
            {ots.length === 0 && (
              <tr><td colSpan={8} className="p-3 text-gray-400 text-center">無</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
