/**
 * 每日日誌頁面
 * 版本: v2.0
 * 日期: 2026-03-06
 * 檔案: src/pages/DailyLog.jsx
 *
 * v2.0 重構：
 *  - work_items 相關改從 workItems.js import
 *  - work_items 表新增 name 欄位（必填），description 改為選填
 *  - projects 不再有 client 欄位，下拉選單顯示 name + type
 *  - 日誌 Modal 的工作項目用 name 作為主欄位
 */

import { useState, useMemo, useEffect } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, addWeeks, subWeeks,
  isSameMonth, isToday,
} from 'date-fns'
import { zhTW } from 'date-fns/locale'
import {
  getLogsByMonth, getLogsByRange,
  createLog, updateLog, deleteLog,
} from '../api/dailyLogs'
import {
  getWorkItemsByLogIds, getWorkItemsByLog, saveWorkItemsForLog,
} from '../api/workItems'
import { getProjects } from '../api/projects'

/* ========== 常數 ========== */

const WORK_TYPES = ['外勤', '內勤', '內勤+外勤', '休假']

const WORK_TYPE_STYLE = {
  '外勤':       'bg-blue-500',
  '內勤':       'bg-green-500',
  '內勤+外勤':  'bg-indigo-500',
  '休假':       'bg-gray-400',
}

const WORK_TYPE_BTN = {
  '外勤':       { active: 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' },
  '內勤':       { active: 'bg-green-100 text-green-700 ring-1 ring-green-300' },
  '內勤+外勤':  { active: 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300' },
  '休假':       { active: 'bg-gray-100 text-gray-600 ring-1 ring-gray-300' },
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 判斷是否需要外勤欄位 */
function needsFieldInfo(workType) {
  return workType === '外勤' || workType === '內勤+外勤'
}

/* ========== 計算外勤時數 ========== */

function calcFieldHours(startTime, endTime) {
  if (!startTime || !endTime) return null
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const diff = (eh * 60 + em) - (sh * 60 + sm)
  if (diff <= 0) return null
  return Math.round(diff / 6) / 10
}

/* ========== 主元件 ========== */

export default function DailyLog() {
  const [viewMode, setViewMode] = useState('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd')

  const swrKey = viewMode === 'month'
    ? `logs-month-${year}-${month}`
    : `logs-week-${weekStartStr}`

  const fetcher = viewMode === 'month'
    ? () => getLogsByMonth(year, month)
    : () => getLogsByRange(weekStartStr, weekEndStr)

  const { data: logs, error, isLoading, mutate } = useSWR(swrKey, fetcher)

  /* 批次載入所有日誌的 work_items */
  const logIds = useMemo(() => (logs || []).map((l) => l.id), [logs])
  const { data: allWorkItems } = useSWR(
    logIds.length > 0 ? `work-items-${swrKey}` : null,
    () => getWorkItemsByLogIds(logIds)
  )

  /** logId → work_items[] 對照表 */
  const workItemsMap = useMemo(() => {
    const map = {}
    if (!allWorkItems) return map
    for (const wi of allWorkItems) {
      if (!map[wi.log_id]) map[wi.log_id] = []
      map[wi.log_id].push(wi)
    }
    return map
  }, [allWorkItems])

  const logMap = useMemo(() => {
    const map = {}
    if (!logs) return map
    for (const log of logs) map[log.log_date] = log
    return map
  }, [logs])

  function handlePrev() {
    if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1))
    else setCurrentDate(subWeeks(currentDate, 1))
  }
  function handleNext() {
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1))
    else setCurrentDate(addWeeks(currentDate, 1))
  }
  function handleToday() { setCurrentDate(new Date()) }

  function handleModalClose() {
    setSelectedDate(null)
    mutate()
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><p className="text-gray-400 text-lg">載入中...</p></div>
  }
  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-500 text-lg mb-2">載入失敗</p>
          <p className="text-gray-400 text-sm">{error.message}</p>
          <button onClick={() => mutate()} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">重新載入</button>
        </div>
      </div>
    )
  }

  const titleText = viewMode === 'month'
    ? format(currentDate, 'yyyy 年 M 月', { locale: zhTW })
    : `${format(weekStart, 'M/d', { locale: zhTW })} — ${format(weekEnd, 'M/d', { locale: zhTW })}`

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">每日日誌</h2>
          <p className="text-gray-400 text-sm mt-1">
            {titleText}，{(logs || []).length} 筆記錄
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'week' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >週</button>
            <button onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'month' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >月</button>
          </div>
          <button onClick={handlePrev}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >◀</button>
          <button onClick={handleToday}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >今天</button>
          <button onClick={handleNext}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >▶</button>
        </div>
      </div>

      {viewMode === 'week' ? (
        <WeekView weekStart={weekStart} logMap={logMap} workItemsMap={workItemsMap} onDateClick={setSelectedDate} />
      ) : (
        <MonthView currentMonth={currentDate} logMap={logMap} workItemsMap={workItemsMap} onDateClick={setSelectedDate} />
      )}

      {selectedDate && (
        <DailyLogModal
          date={selectedDate}
          existingLog={logMap[format(selectedDate, 'yyyy-MM-dd')]}
          onClose={handleModalClose}
        />
      )}
    </div>
  )
}

/* ========== 週視圖 ========== */

function WeekView({ weekStart, logMap, workItemsMap, onDateClick }) {
  const days = []
  for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i))

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {days.map((d) => {
        const dateStr = format(d, 'yyyy-MM-dd')
        const log = logMap[dateStr]
        const today = isToday(d)
        const dayOfWeek = d.getDay()
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
        const items = log ? (workItemsMap[log.id] || []) : []

        return (
          <div key={dateStr}
            onClick={() => onDateClick(d)}
            className={`flex border-b border-gray-50 last:border-b-0 cursor-pointer transition-colors hover:bg-blue-50 ${
              today ? 'bg-blue-50/50' : ''
            }`}
          >
            <div className={`w-24 flex-shrink-0 p-3 flex flex-col items-center justify-center border-r border-gray-50 ${
              isWeekend ? 'bg-red-50/30' : ''
            }`}>
              <span className="text-xs text-gray-400">{WEEKDAYS[dayOfWeek]}</span>
              <span className={`text-lg font-bold w-9 h-9 flex items-center justify-center rounded-full ${
                today ? 'bg-blue-600 text-white' : isWeekend ? 'text-red-400' : 'text-gray-700'
              }`}>
                {format(d, 'd')}
              </span>
              <span className="text-xs text-gray-300">{format(d, 'M月')}</span>
            </div>

            <div className="flex-1 p-3 min-h-20">
              {!log ? (
                <p className="text-xs text-gray-300 pt-2">點擊新增日誌</p>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`w-2 h-2 rounded-full ${WORK_TYPE_STYLE[log.work_type] || 'bg-gray-400'}`} />
                    <span className="text-xs font-medium text-gray-600">{log.work_type}</span>
                    {log.field_hours && (
                      <span className="text-xs text-gray-400">
                        {log.field_start?.substring(0, 5)}–{log.field_end?.substring(0, 5)}（{log.field_hours}h）
                      </span>
                    )}
                    {(log.field_locations || []).length > 0 && (
                      <span className="text-xs text-blue-500">
                        📍 {log.field_locations.join('、')}
                      </span>
                    )}
                  </div>
                  {items.length > 0 && (
                    <div className="space-y-0.5 pl-4">
                      {items.map((item) => (
                        <p key={item.id} className="text-xs text-gray-500">
                          • {item.name}
                          {item.projects && (
                            <span className="text-blue-400 ml-1">
                              [{item.projects.name}]
                            </span>
                          )}
                        </p>
                      ))}
                    </div>
                  )}
                  {log.work_summary && items.length === 0 && (
                    <p className="text-xs text-gray-400 pl-4">{log.work_summary}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ========== 月視圖 ========== */

function MonthView({ currentMonth, logMap, workItemsMap, onDateClick }) {
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

  const days = []
  let day = calStart
  while (day <= calEnd) { days.push(day); day = addDays(day, 1) }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-100">
        {WEEKDAYS.map((wd, i) => (
          <div key={wd}
            className={`py-3 text-center text-xs font-medium ${
              i === 0 || i === 6 ? 'text-red-400' : 'text-gray-500'
            }`}
          >{wd}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const dateStr = format(d, 'yyyy-MM-dd')
          const log = logMap[dateStr]
          const inMonth = isSameMonth(d, currentMonth)
          const today = isToday(d)
          const dayOfWeek = d.getDay()
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
          const items = log ? (workItemsMap[log.id] || []) : []

          return (
            <div key={dateStr}
              onClick={() => onDateClick(d)}
              className={`min-h-24 p-2 border-b border-r border-gray-50 cursor-pointer transition-colors ${
                inMonth ? 'hover:bg-blue-50' : 'bg-gray-50/50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${
                  today
                    ? 'bg-blue-600 text-white'
                    : !inMonth ? 'text-gray-300'
                    : isWeekend ? 'text-red-400' : 'text-gray-700'
                }`}>
                  {format(d, 'd')}
                </span>
              </div>
              {log && inMonth && (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${WORK_TYPE_STYLE[log.work_type] || 'bg-gray-400'}`} />
                    <span className="text-xs text-gray-500">{log.work_type}</span>
                    {log.field_hours && (
                      <span className="text-xs text-gray-400">{log.field_hours}h</span>
                    )}
                  </div>
                  {items.length > 0 && (
                    <p className="text-xs text-gray-400 pl-3 truncate">
                      {items.map((it) => it.name).join('、')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ========== 日誌 Modal ========== */

function DailyLogModal({ date, existingLog, onClose }) {
  const dateStr = format(date, 'yyyy-MM-dd')
  const dateDisplay = format(date, 'yyyy 年 M 月 d 日（EEEE）', { locale: zhTW })

  const [form, setForm] = useState({
    work_type: '外勤',
    work_summary: '',
    field_start: '',
    field_end: '',
    field_hours: null,
    field_locations: [],
    work_items: [],   // [{ name, project_id }]
  })
  const [saving, setSaving] = useState(false)
  const [logId, setLogId] = useState(null)
  const [loaded, setLoaded] = useState(false)

  const { data: projects } = useSWR('projects', getProjects)

  /* 載入資料 */
  useEffect(() => {
    async function loadData() {
      if (existingLog) {
        setForm({
          work_type: existingLog.work_type || '外勤',
          work_summary: existingLog.work_summary || '',
          field_start: existingLog.field_start?.substring(0, 5) || '',
          field_end: existingLog.field_end?.substring(0, 5) || '',
          field_hours: existingLog.field_hours,
          field_locations: existingLog.field_locations || [],
          work_items: [],
        })
        setLogId(existingLog.id)

        // 從 work_items 表載入
        try {
          const items = await getWorkItemsByLog(existingLog.id)
          setForm((prev) => ({
            ...prev,
            work_items: items.length > 0
              ? items.map((wi) => ({ name: wi.name, project_id: wi.project_id || '' }))
              : [{ name: '', project_id: '' }],
          }))
        } catch {
          setForm((prev) => ({ ...prev, work_items: [{ name: '', project_id: '' }] }))
        }
      } else {
        setForm({
          work_type: '外勤',
          work_summary: '',
          field_start: '09:00',
          field_end: '17:30',
          field_hours: calcFieldHours('09:00', '17:30'),
          field_locations: [],
          work_items: [{ name: '', project_id: '' }],
        })
        setLogId(null)
      }
      setLoaded(true)
    }
    loadData()
  }, [existingLog])

  function handleChange(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'field_start' || field === 'field_end') {
        const start = field === 'field_start' ? value : prev.field_start
        const end = field === 'field_end' ? value : prev.field_end
        next.field_hours = calcFieldHours(start, end)
      }
      return next
    })
  }

  function handleItemChange(index, field, value) {
    setForm((prev) => {
      const items = [...prev.work_items]
      items[index] = { ...items[index], [field]: value }
      return { ...prev, work_items: items }
    })
  }

  function handleAddItem() {
    setForm((prev) => ({
      ...prev,
      work_items: [...prev.work_items, { name: '', project_id: '' }],
    }))
  }

  function handleRemoveItem(index) {
    setForm((prev) => ({
      ...prev,
      work_items: prev.work_items.filter((_, i) => i !== index),
    }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const showField = needsFieldInfo(form.work_type)

      const payload = {
        log_date: dateStr,
        work_type: form.work_type,
        work_summary: form.work_summary || null,
        field_start: showField ? (form.field_start || null) : null,
        field_end: showField ? (form.field_end || null) : null,
        field_hours: showField ? form.field_hours : null,
        field_locations: showField ? form.field_locations : [],
      }

      let savedLog
      if (logId) {
        savedLog = await updateLog(logId, payload)
      } else {
        savedLog = await createLog(payload)
      }

      // 儲存工作項目到 work_items 表
      const cleanItems = form.work_items
        .filter((it) => it.name && it.name.trim() !== '')
        .map((it) => ({
          name: it.name.trim(),
          project_id: it.project_id || null,
        }))
      await saveWorkItemsForLog(savedLog.id, cleanItems)

      toast.success(logId ? '日誌已更新' : '日誌已建立')
      onClose()
    } catch (err) {
      toast.error('儲存失敗：' + err.message)
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!logId) return
    if (!window.confirm('確定要刪除此日誌嗎？')) return
    try {
      await deleteLog(logId)
      toast.success('日誌已刪除')
      onClose()
    } catch (err) {
      toast.error('刪除失敗：' + err.message)
    }
  }

  const showField = needsFieldInfo(form.work_type)

  if (!loaded) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{dateDisplay}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{logId ? '編輯日誌' : '新增日誌'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-4">

            {/* 工作類型 */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">工作類型</label>
              <div className="flex gap-2">
                {WORK_TYPES.map((wt) => (
                  <button key={wt} type="button"
                    onClick={() => handleChange('work_type', wt)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      form.work_type === wt
                        ? WORK_TYPE_BTN[wt].active
                        : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                    }`}
                  >{wt}</button>
                ))}
              </div>
            </div>

            {/* 外勤時間 */}
            {showField && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">開始時間</label>
                  <input type="time" value={form.field_start}
                    onChange={(e) => handleChange('field_start', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">結束時間</label>
                  <input type="time" value={form.field_end}
                    onChange={(e) => handleChange('field_end', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">外勤時數</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
                    {form.field_hours != null ? `${form.field_hours} 小時` : '—'}
                  </div>
                </div>
              </div>
            )}

            {/* 外勤地點 */}
            {showField && (
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">外勤地點</label>
                <input type="text"
                  value={(form.field_locations || []).join('、')}
                  onChange={(e) => {
                    const locs = e.target.value.split(/[,、]/).map((s) => s.trim()).filter(Boolean)
                    handleChange('field_locations', locs)
                  }}
                  placeholder="用頓號分隔，例：土城宏錩、桃園欣桃"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* 工作項目列表 */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                工作項目
                {form.work_items.length > 0 && (
                  <span className="text-gray-400 font-normal ml-1">
                    （{form.work_items.filter((it) => it.name.trim()).length} 條）
                  </span>
                )}
              </label>
              <div className="space-y-2">
                {form.work_items.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
                    <span className="text-xs text-gray-300 w-5 text-right pt-2.5">{idx + 1}.</span>
                    <div className="flex-1 space-y-1.5">
                      <input type="text"
                        value={item.name}
                        onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                        placeholder="輸入工作內容..."
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddItem()
                          }
                        }}
                      />
                      <select
                        value={item.project_id || ''}
                        onChange={(e) => handleItemChange(idx, 'project_id', e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-500"
                      >
                        <option value="">— 無關聯案件 —</option>
                        {(projects || []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}{p.type ? ` (${p.type})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    {form.work_items.length > 1 && (
                      <button onClick={() => handleRemoveItem(idx)}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors px-1 pt-2.5"
                      >✕</button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={handleAddItem}
                className="mt-2 text-xs text-blue-600 hover:text-blue-700 transition-colors"
              >＋ 新增工作項目</button>
            </div>

            {/* 補充備註 */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">補充備註</label>
              <textarea value={form.work_summary} rows={2}
                onChange={(e) => handleChange('work_summary', e.target.value)}
                placeholder="其他補充說明..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          {logId ? (
            <button onClick={handleDelete}
              className="text-sm text-red-500 hover:text-red-700 transition-colors"
            >刪除日誌</button>
          ) : <div />}
          <div className="flex gap-3">
            <button onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >取消</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >{saving ? '儲存中...' : '儲存'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
