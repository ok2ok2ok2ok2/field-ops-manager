/**
 * 月報表 — 從 daily_logs 拆成公差單 + 加班表, 可編輯 + 匯出 xlsx
 * 版本: v0.2.0
 * 日期: 2026-07-09
 * 檔案: src/pages/MonthlyReport.jsx
 *
 * v0.2.0: 可編輯 (inline input, 加/刪列) + 匯出 xlsx (以範本為骨架)
 * v0.1.0: read-only 預覽
 */

import { useEffect, useMemo, useState } from 'react'
import { getLogsByMonth } from '../api/dailyLogs'
import { getWorkItemsByLogIds } from '../api/workItems'
import { buildReport, RULES } from '../lib/monthlyReport'
import { exportBusinessTrip, exportOvertime } from '../lib/monthlyReportExport'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

const now = new Date()

const OT_COLS = [
  { key: 'weekday_2',      label: '上班日前2' },
  { key: 'weekday_after2', label: '上班日2+' },
  { key: 'sat_2',          label: '周六前2' },
  { key: 'sat_3to8',       label: '周六3-8' },
  { key: 'sat_8plus',      label: '周六8+' },
  { key: 'sunday',         label: '周日' },
]

export default function MonthlyReport() {
  const { profile, user } = useAuth()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [loading, setLoading] = useState(false)
  const [applicant, setApplicant] = useState('')
  const [trips, setTrips] = useState([])
  const [ots, setOts] = useState([])
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    if (profile?.full_name) setApplicant(profile.full_name)
    else if (user?.email) setApplicant(user.email.split('@')[0])
  }, [profile, user])

  const totals = useMemo(() => ({
    trip_hours: sum(trips.map((t) => Number(t.hours) || 0)),
    trip_meal:  sum(trips.map((t) => Number(t.meal_fee) || 0)),
    ot_hours:   sum(ots.map((o) => Number(o.hours) || 0)),
  }), [trips, ots])

  async function loadMonth() {
    setLoading(true)
    setErrMsg('')
    try {
      const raw = await getLogsByMonth(year, month)
      const items = await getWorkItemsByLogIds(raw.map((l) => l.id))
      const itemMap = {}
      for (const it of items) {
        const k = it.log_id
        if (!itemMap[k]) itemMap[k] = []
        itemMap[k].push(it)
      }
      const enriched = raw.map((l) => ({ ...l, work_items: itemMap[l.id] || [] }))
      const rep = buildReport(enriched)
      setTrips(rep.businessTrips)
      setOts(rep.overtimes)
    } catch (e) {
      setErrMsg(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function doExportTrip() {
    try {
      if (trips.length === 0) return toast.error('沒有公差資料')
      await exportBusinessTrip(applicant, trips)
      toast.success('公差單已下載')
    } catch (e) {
      toast.error('匯出失敗: ' + (e?.message || e))
    }
  }

  async function doExportOt() {
    try {
      if (ots.length === 0) return toast.error('沒有加班資料')
      await exportOvertime(applicant, ots)
      toast.success('加班表已下載')
    } catch (e) {
      toast.error('匯出失敗: ' + (e?.message || e))
    }
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-baseline gap-2 mb-3">
        <h1 className="text-xl font-bold">月報表匯出</h1>
        <span className="text-xs text-gray-500">v0.2.0 · 可編輯 + 匯出 xlsx</span>
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
        <label className="text-sm ml-4">
          申請人:
          <input value={applicant} onChange={(e) => setApplicant(e.target.value)}
            className="ml-1 w-32 border rounded px-2" />
        </label>
        <span className="ml-auto text-xs text-gray-500">
          規則: {RULES.WORK_START}–{RULES.WORK_END} · 誤餐 ${RULES.MEAL_PRICE}/餐
        </span>
      </div>

      {errMsg && <div className="text-red-600 text-sm mb-2">錯誤: {errMsg}</div>}

      <TripSection trips={trips} setTrips={setTrips} totals={totals} onExport={doExportTrip} />
      <OtSection ots={ots} setOts={setOts} totals={totals} onExport={doExportOt} />
    </div>
  )
}

/* ========== 公差單編輯 ========== */
function TripSection({ trips, setTrips, totals, onExport }) {
  function upd(i, field, value) {
    setTrips((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)))
  }
  function addRow() {
    setTrips((prev) => [...prev, {
      log_date: '', roc_year: '', start_hhmm: '09:00', end_hhmm: '17:30',
      hours: 8.5, remark: '', meal_fee: 0, meal_tags: [],
    }])
  }
  function delRow(i) { setTrips((prev) => prev.filter((_, idx) => idx !== i)) }

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="font-semibold text-base">公差單</h2>
        <span className="text-xs text-gray-500">{trips.length} 筆 · 誤餐 ${totals.trip_meal} · 時 {totals.trip_hours}</span>
        <button onClick={addRow} className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-200">+ 新增列</button>
        <button onClick={onExport} className="ml-auto px-3 py-1 rounded bg-emerald-600 text-white text-sm">
          匯出公差單 xlsx
        </button>
      </div>
      <div className="overflow-x-auto bg-white rounded shadow-sm">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-1">#</th>
              <th className="p-1">日期</th>
              <th className="p-1">起</th>
              <th className="p-1">訖</th>
              <th className="p-1">時數</th>
              <th className="p-1 text-left">備註 (地點/事由)</th>
              <th className="p-1">誤餐$</th>
              <th className="p-1"></th>
            </tr>
          </thead>
          <tbody>
            {trips.map((t, i) => (
              <tr key={i} className="border-t">
                <td className="p-1 text-center text-gray-400">{i + 1}</td>
                <td className="p-1"><input type="date" value={t.log_date} onChange={(e) => upd(i, 'log_date', e.target.value)} className="w-32 border rounded px-1" /></td>
                <td className="p-1"><input type="time" value={t.start_hhmm} onChange={(e) => upd(i, 'start_hhmm', e.target.value)} className="w-24 border rounded px-1" /></td>
                <td className="p-1"><input type="time" value={t.end_hhmm} onChange={(e) => upd(i, 'end_hhmm', e.target.value)} className="w-24 border rounded px-1" /></td>
                <td className="p-1"><input type="number" step="0.5" value={t.hours} onChange={(e) => upd(i, 'hours', Number(e.target.value))} className="w-16 border rounded px-1 text-right" /></td>
                <td className="p-1"><input value={t.remark} onChange={(e) => upd(i, 'remark', e.target.value)} className="w-full border rounded px-1" /></td>
                <td className="p-1"><input type="number" step="100" value={t.meal_fee} onChange={(e) => upd(i, 'meal_fee', Number(e.target.value))} className="w-20 border rounded px-1 text-right" /></td>
                <td className="p-1"><button onClick={() => delRow(i)} className="text-red-500 text-xs">×</button></td>
              </tr>
            ))}
            {trips.length === 0 && (
              <tr><td colSpan={8} className="p-3 text-gray-400 text-center">無 (按「載入」或「+ 新增列」)</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ========== 加班表編輯 ========== */
function OtSection({ ots, setOts, totals, onExport }) {
  function upd(i, field, value) {
    setOts((prev) => prev.map((o, idx) => (idx === i ? { ...o, [field]: value } : o)))
  }
  function updBreakdown(i, colKey, value) {
    setOts((prev) => prev.map((o, idx) => {
      if (idx !== i) return o
      const clean = (o.breakdown || []).filter((b) => b.column !== colKey)
      const num = Number(value)
      const next = value === '' || num === 0 ? clean : [...clean, { column: colKey, hours: num }]
      return { ...o, breakdown: next }
    }))
  }
  function getBreakdownVal(o, colKey) {
    const b = (o.breakdown || []).find((b) => b.column === colKey)
    return b ? b.hours : ''
  }
  function addRow() {
    setOts((prev) => [...prev, {
      log_date: '', start_hhmm: '17:30', end_hhmm: '19:00',
      hours: 1.5, remark: '', project: '', breakdown: [{ column: 'weekday_2', hours: 1.5 }],
    }])
  }
  function delRow(i) { setOts((prev) => prev.filter((_, idx) => idx !== i)) }

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="font-semibold text-base">加班表</h2>
        <span className="text-xs text-gray-500">{ots.length} 筆 · 時數 {totals.ot_hours}</span>
        <button onClick={addRow} className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-200">+ 新增列</button>
        <button onClick={onExport} className="ml-auto px-3 py-1 rounded bg-emerald-600 text-white text-sm">
          匯出加班表 xlsx
        </button>
      </div>
      <div className="overflow-x-auto bg-white rounded shadow-sm">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-1">#</th>
              <th className="p-1">日期</th>
              <th className="p-1">起</th>
              <th className="p-1">訖</th>
              <th className="p-1">時</th>
              <th className="p-1 text-left">案子</th>
              <th className="p-1 text-left">備註</th>
              {OT_COLS.map((c) => (
                <th key={c.key} className="p-1 text-center" title={c.label}>{c.label}</th>
              ))}
              <th className="p-1"></th>
            </tr>
          </thead>
          <tbody>
            {ots.map((o, i) => (
              <tr key={i} className="border-t">
                <td className="p-1 text-center text-gray-400">{i + 1}</td>
                <td className="p-1"><input type="date" value={o.log_date} onChange={(e) => upd(i, 'log_date', e.target.value)} className="w-32 border rounded px-1" /></td>
                <td className="p-1"><input type="time" value={o.start_hhmm} onChange={(e) => upd(i, 'start_hhmm', e.target.value)} className="w-24 border rounded px-1" /></td>
                <td className="p-1"><input type="time" value={o.end_hhmm} onChange={(e) => upd(i, 'end_hhmm', e.target.value)} className="w-24 border rounded px-1" /></td>
                <td className="p-1"><input type="number" step="0.5" value={o.hours} onChange={(e) => upd(i, 'hours', Number(e.target.value))} className="w-14 border rounded px-1 text-right" /></td>
                <td className="p-1"><input value={o.project} onChange={(e) => upd(i, 'project', e.target.value)} className="w-32 border rounded px-1" /></td>
                <td className="p-1"><input value={o.remark} onChange={(e) => upd(i, 'remark', e.target.value)} className="w-32 border rounded px-1" /></td>
                {OT_COLS.map((c) => (
                  <td key={c.key} className="p-1">
                    <input type="number" step="0.5" value={getBreakdownVal(o, c.key)}
                      onChange={(e) => updBreakdown(i, c.key, e.target.value)}
                      className="w-14 border rounded px-1 text-right" />
                  </td>
                ))}
                <td className="p-1"><button onClick={() => delRow(i)} className="text-red-500 text-xs">×</button></td>
              </tr>
            ))}
            {ots.length === 0 && (
              <tr><td colSpan={8 + OT_COLS.length} className="p-3 text-gray-400 text-center">無 (按「載入」或「+ 新增列」)</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function sum(arr) { return arr.reduce((s, n) => s + n, 0) }
