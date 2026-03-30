/**
 * 工作日誌頁面（瘦身版）
 * 版本: v2.0
 * 日期: 2026-03-27
 * 檔案: src/pages/WorkDashboard.jsx
 *
 * v2.0：ProjectBar / PendingPanel / ProjectModal / VisibilityModal / WorkItemModal
 *       全部搬到 Layout + WorkContext，本檔只保留日誌區
 *       （WeekView / MonthView / DailyLogModal）
 *       從 useWork() 取 filterProjectId / teamMode 等共用 state
 * v1.6：工作日誌多人顯示優化
 * v1.5：P10 案件可見性 — 兩層篩選
 * v1.4：boss/admin 檢視模式
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
  getLogsByMonth, getLogsByRange, getLogByDate,
  getAllUsersLogsByRange, getAllUsersLogsByMonth,
  createLog, updateLog, deleteLog,
} from '../api/dailyLogs'
import {
  getWorkItemsByLogIds, getWorkItemsByLog,
  saveWorkItemsForLog,
} from '../api/workItems'
import { useAuth } from '../contexts/AuthContext'
import { useWork } from '../contexts/WorkContext'

/* ========== 常數 ========== */

const WORK_TYPES = ['外勤', '內勤', '內勤+外勤', '休假']

const WORK_TYPE_STYLE = {
  '外勤':      'bg-blue-500',
  '內勤':      'bg-green-500',
  '內勤+外勤': 'bg-indigo-500',
  '休假':      'bg-gray-400',
}

const WORK_TYPE_BTN = {
  '外勤':      { active: 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' },
  '內勤':      { active: 'bg-green-100 text-green-700 ring-1 ring-green-300' },
  '內勤+外勤': { active: 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300' },
  '休假':      { active: 'bg-gray-100 text-gray-600 ring-1 ring-gray-300' },
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function needsFieldInfo(wt) { return wt === '外勤' || wt === '內勤+外勤' }

function calcFieldHours(s, e) {
  if (!s || !e) return null
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  const diff = (eh * 60 + em) - (sh * 60 + sm)
  return diff <= 0 ? null : Math.round(diff / 6) / 10
}

/* ================================================================
   主元件
   ================================================================ */

export default function WorkDashboard() {
  const { user } = useAuth()
  const {
    projects, filterProjectId, visibleProjectIds,
    teamMode, filterUserId, setFilterUserId,
    canViewAll, profilesList, userNameMap, isReadOnly,
    handleToggleTeamMode, refreshWorkData,
  } = useWork()

  const [viewMode, setViewMode] = useState('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)

  /* ── 日誌 SWR ── */

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd')

  const logSwrKey = teamMode
    ? (viewMode === 'month' ? `logs-team-month-${year}-${month}-${filterUserId}` : `logs-team-week-${weekStartStr}-${filterUserId}`)
    : (viewMode === 'month' ? `logs-month-${year}-${month}` : `logs-week-${weekStartStr}`)

  const logFetcher = teamMode
    ? (viewMode === 'month'
      ? () => getAllUsersLogsByMonth(year, month, filterUserId || null)
      : () => getAllUsersLogsByRange(weekStartStr, weekEndStr, filterUserId || null))
    : (viewMode === 'month'
      ? () => getLogsByMonth(year, month)
      : () => getLogsByRange(weekStartStr, weekEndStr))

  const { data: logs, isLoading: logsLoading, mutate: mutateLogs } = useSWR(logSwrKey, logFetcher)

  const logIds = useMemo(() => (logs || []).map((l) => l.id), [logs])
  const { data: logWorkItems } = useSWR(
    logIds.length > 0 ? `wi-${logSwrKey}` : null,
    () => getWorkItemsByLogIds(logIds)
  )

  const workItemsMap = useMemo(() => {
    const map = {}
    if (!logWorkItems) return map
    for (const wi of logWorkItems) {
      if (!map[wi.log_id]) map[wi.log_id] = []
      map[wi.log_id].push(wi)
    }
    return map
  }, [logWorkItems])

  const logMap = useMemo(() => {
    const map = {}
    if (!logs) return map
    for (const log of logs) {
      if (!map[log.log_date]) map[log.log_date] = []
      map[log.log_date].push(log)
    }
    return map
  }, [logs])

  const filteredWorkItemsMap = useMemo(() => {
    if (!filterProjectId) return workItemsMap
    const map = {}
    for (const [lid, items] of Object.entries(workItemsMap)) {
      const f = items.filter((wi) => wi.project_id === filterProjectId)
      if (f.length > 0) map[lid] = f
    }
    return map
  }, [workItemsMap, filterProjectId])

  /* ── handlers ── */

  function handlePrev() { viewMode === 'month' ? setCurrentDate(subMonths(currentDate, 1)) : setCurrentDate(subWeeks(currentDate, 1)) }
  function handleNext() { viewMode === 'month' ? setCurrentDate(addMonths(currentDate, 1)) : setCurrentDate(addWeeks(currentDate, 1)) }
  function handleToday() { setCurrentDate(new Date()) }

  function handleDailyModalClose() {
    setSelectedDate(null)
    mutateLogs()
    refreshWorkData()   // ★ 同步 refresh Context 裡的 workItems
  }

  const titleText = viewMode === 'month'
    ? format(currentDate, 'yyyy 年 M 月', { locale: zhTW })
    : `${format(weekStart, 'M/d', { locale: zhTW })} — ${format(weekEnd, 'M/d', { locale: zhTW })}`

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-5">
        {/* 標題列 + 控制列 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-800">
              工作日誌
              {teamMode && <span className="text-sm font-normal text-purple-500 ml-2">👥 團隊檢視</span>}
              {isReadOnly && <span className="text-sm font-normal text-amber-500 ml-2">🔒 唯讀</span>}
            </h2>
            <p className="text-gray-400 text-xs mt-0.5">
              {titleText}
              {filterProjectId && (
                <span className="ml-2 text-blue-500">🔍 已篩選：{projects.find((p) => p.id === filterProjectId)?.name || ''}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">

            {canViewAll && (
              <>
                <button onClick={handleToggleTeamMode}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    teamMode ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-300' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >{teamMode ? '👥 全員' : '👤 我的'}</button>

                {teamMode && profilesList && (
                  <select value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)}
                    className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">全部人員</option>
                    {profilesList.map((p) => (
                      <option key={p.id} value={p.id}>{p.display_name || p.id.substring(0, 8)}</option>
                    ))}
                  </select>
                )}
              </>
            )}

            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => setViewMode('week')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'week' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >週</button>
              <button onClick={() => setViewMode('month')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'month' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >月</button>
            </div>
            <button onClick={handlePrev} className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">◀</button>
            <button onClick={handleToday} className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">今天</button>
            <button onClick={handleNext} className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">▶</button>
          </div>
        </div>

        {/* 日誌視圖 */}
        {logsLoading ? (
          <div className="flex items-center justify-center py-20"><p className="text-gray-400">載入中...</p></div>
        ) : viewMode === 'week' ? (
          <WeekView weekStart={weekStart} logMap={logMap} workItemsMap={filteredWorkItemsMap}
            onDateClick={(d) => { if (!isReadOnly) setSelectedDate(d) }}
            teamMode={teamMode} userNameMap={userNameMap}
          />
        ) : (
          <MonthView currentMonth={currentDate} logMap={logMap} workItemsMap={filteredWorkItemsMap}
            onDateClick={(d) => { if (!isReadOnly) setSelectedDate(d) }}
            teamMode={teamMode} userNameMap={userNameMap}
          />
        )}
      </div>

      {/* 日誌 Modal */}
      {selectedDate && !isReadOnly && (
        <DailyLogModal date={selectedDate}
          existingLog={(() => {
            const logsForDate = logMap[format(selectedDate, 'yyyy-MM-dd')] || []
            return logsForDate.find((l) => l.user_id === user?.id) || (logsForDate.length === 1 && !teamMode ? logsForDate[0] : null)
          })()}
          onClose={handleDailyModalClose} visibleProjects={projects} />
      )}
    </div>
  )
}

/* ================================================================
   WeekView — 週視圖（保持不變）
   ================================================================ */

function WeekView({ weekStart, logMap, workItemsMap, onDateClick, teamMode, userNameMap }) {
  const [hoveredIdx, setHoveredIdx] = useState(null)
  const [hoveredLogId, setHoveredLogId] = useState(null)
  const days = []
  for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i))

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {days.map((d, idx) => {
        const dateStr = format(d, 'yyyy-MM-dd')
        const dayLogs = logMap[dateStr] || []
        const today = isToday(d)
        const dayOfWeek = d.getDay()
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
        const hasData = dayLogs.length > 0
        const isHovered = hoveredIdx === idx

        const rowMinHeight = isHovered ? 120 : (hasData ? 80 : 48)

        return (
          <div key={dateStr}
            className="relative border-b border-gray-50 last:border-b-0"
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => { setHoveredIdx(null); setHoveredLogId(null) }}
          >
            <div
              onClick={() => onDateClick(d)}
              className={`flex cursor-pointer transition-all duration-200 ${
                today ? 'bg-blue-50/50' : isHovered ? 'bg-blue-50/30' : ''
              }`}
              style={{ minHeight: rowMinHeight }}
            >
              <div className={`flex-shrink-0 p-3 flex flex-col items-center justify-center border-r border-gray-50 transition-all duration-200 ${
                isWeekend ? 'bg-red-50/30' : ''
              }`} style={{ width: isHovered ? 100 : 80 }}>
                <span className={`text-gray-400 transition-all duration-200 ${isHovered ? 'text-sm' : 'text-xs'}`}>
                  {WEEKDAYS[dayOfWeek]}
                </span>
                <span className={`font-bold flex items-center justify-center rounded-full transition-all duration-200 ${
                  today ? 'bg-blue-600 text-white' : isWeekend ? 'text-red-400' : 'text-gray-700'
                } ${isHovered ? 'text-2xl w-11 h-11' : 'text-lg w-9 h-9'}`}>
                  {format(d, 'd')}
                </span>
                <span className={`text-gray-300 transition-all duration-200 ${isHovered ? 'text-sm' : 'text-xs'}`}>
                  {format(d, 'M月')}
                </span>
              </div>

              <div className="flex-1 p-3">
                {!hasData ? (
                  <p className={`text-gray-300 pt-1 transition-all duration-200 ${isHovered ? 'text-sm' : 'text-xs'}`}>
                    {teamMode ? '' : '點擊新增日誌'}
                  </p>
                ) : dayLogs.length === 1 ? (
                  <WeekDayLogBlock log={dayLogs[0]} items={workItemsMap[dayLogs[0].id] || []}
                    isHovered={isHovered} teamMode={teamMode} userNameMap={userNameMap}
                    onHoverLog={setHoveredLogId} />
                ) : (
                  <div className="flex gap-3 flex-wrap">
                    {dayLogs.map((log) => (
                      <div key={log.id} className="flex-1 min-w-0"
                        onMouseEnter={(e) => { e.stopPropagation(); setHoveredLogId(log.id) }}
                        onMouseLeave={(e) => { e.stopPropagation(); setHoveredLogId(null) }}
                      >
                        <WeekDayLogBlock log={log} items={workItemsMap[log.id] || []}
                          isHovered={isHovered} teamMode={teamMode} userNameMap={userNameMap}
                          onHoverLog={setHoveredLogId} compact />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {isHovered && hasData && (() => {
              const targetLog = hoveredLogId
                ? dayLogs.find((l) => l.id === hoveredLogId)
                : dayLogs[0]
              if (!targetLog) return null
              const targetItems = workItemsMap[targetLog.id] || []
              return (
                <div className="absolute right-4 top-2 z-10 bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-72 pointer-events-none">
                  <div className="flex items-center gap-2 mb-2">
                    {teamMode && targetLog.user_id && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 font-medium">
                        {userNameMap[targetLog.user_id] || '?'}
                      </span>
                    )}
                    <span className={`w-3 h-3 rounded-full ${WORK_TYPE_STYLE[targetLog.work_type] || 'bg-gray-400'}`} />
                    <span className="text-sm font-bold text-gray-800">
                      {format(d, 'M/d（E）', { locale: zhTW })}
                    </span>
                    <span className="text-sm text-gray-500">{targetLog.work_type}</span>
                  </div>
                  {targetLog.field_hours && (
                    <p className="text-sm text-gray-500 mb-1">
                      🕐 {targetLog.field_start?.substring(0, 5)}–{targetLog.field_end?.substring(0, 5)}（{targetLog.field_hours}h）
                    </p>
                  )}
                  {(targetLog.field_locations || []).length > 0 && (
                    <p className="text-sm text-blue-500 mb-2">📍 {targetLog.field_locations.join('、')}</p>
                  )}
                  {targetItems.length > 0 && (
                    <div className="border-t border-gray-100 pt-2 space-y-1">
                      {targetItems.map((item) => (
                        <div key={item.id} className="flex items-start gap-1.5">
                          <span className="text-sm text-gray-400 mt-0.5">•</span>
                          <div>
                            <span className="text-sm text-gray-700">{item.name}</span>
                            {item.projects && (
                              <span className="text-xs text-blue-400 ml-1">[{item.projects.name}]</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {targetLog.work_summary && (
                    <p className="text-sm text-gray-400 mt-2 pt-2 border-t border-gray-100">💬 {targetLog.work_summary}</p>
                  )}
                </div>
              )
            })()}
          </div>
        )
      })}
    </div>
  )
}

/** 週視圖中單筆日誌的行內顯示區塊 */
function WeekDayLogBlock({ log, items, isHovered, teamMode, userNameMap, onHoverLog, compact }) {
  return (
    <div className={`space-y-1.5 ${compact ? 'p-2 rounded-lg bg-gray-50/80 border border-gray-100' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        {teamMode && log.user_id && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 font-medium">
            {userNameMap[log.user_id] || '?'}
          </span>
        )}
        <span className={`rounded-full ${WORK_TYPE_STYLE[log.work_type] || 'bg-gray-400'} ${isHovered ? 'w-2.5 h-2.5' : 'w-2 h-2'}`} />
        <span className={`font-medium text-gray-600 transition-all duration-200 ${isHovered ? 'text-sm' : 'text-xs'}`}>
          {log.work_type}
        </span>
        {log.field_hours && (
          <span className={`text-gray-400 transition-all duration-200 ${isHovered ? 'text-sm' : 'text-xs'}`}>
            {log.field_start?.substring(0, 5)}–{log.field_end?.substring(0, 5)}（{log.field_hours}h）
          </span>
        )}
        {!compact && (log.field_locations || []).length > 0 && (
          <span className={`text-blue-500 transition-all duration-200 ${isHovered ? 'text-sm' : 'text-xs'}`}>
            📍 {log.field_locations.join('、')}
          </span>
        )}
      </div>
      {items.length > 0 && (
        <div className="space-y-0.5 pl-4">
          {(compact ? items.slice(0, 2) : items).map((item) => (
            <p key={item.id} className={`text-gray-500 transition-all duration-200 ${isHovered ? 'text-sm' : 'text-xs'}`}>
              • {item.name}
              {item.projects && <span className="text-blue-400 ml-1">[{item.projects.name}]</span>}
            </p>
          ))}
          {compact && items.length > 2 && (
            <p className="text-xs text-gray-400">...還有 {items.length - 2} 項</p>
          )}
        </div>
      )}
      {!compact && log.work_summary && (
        <p className={`text-gray-400 pl-4 transition-all duration-200 ${isHovered ? 'text-sm' : 'text-xs'}`}>
          💬 {log.work_summary}
        </p>
      )}
    </div>
  )
}

/* ================================================================
   MonthView — 月視圖（保持不變）
   ================================================================ */

function MonthView({ currentMonth, logMap, workItemsMap, onDateClick, teamMode, userNameMap }) {
  const [hoveredDateStr, setHoveredDateStr] = useState(null)
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
          <div key={wd} className={`py-3 text-center text-xs font-medium ${i === 0 || i === 6 ? 'text-red-400' : 'text-gray-500'}`}>{wd}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const dateStr = format(d, 'yyyy-MM-dd')
          const dayLogs = logMap[dateStr] || []
          const inMonth = isSameMonth(d, currentMonth)
          const today = isToday(d)
          const dayOfWeek = d.getDay()
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
          const hasData = dayLogs.length > 0 && inMonth
          const isHovered = hoveredDateStr === dateStr

          return (
            <div key={dateStr}
              className={`relative min-h-24 p-2 border-b border-r border-gray-50 cursor-pointer transition-colors ${inMonth ? 'hover:bg-blue-50' : 'bg-gray-50/50'}`}
              onClick={() => onDateClick(d)}
              onMouseEnter={() => setHoveredDateStr(dateStr)}
              onMouseLeave={() => setHoveredDateStr(null)}
            >
              <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${
                today ? 'bg-blue-600 text-white' : !inMonth ? 'text-gray-300' : isWeekend ? 'text-red-400' : 'text-gray-700'
              }`}>{format(d, 'd')}</span>

              {hasData && dayLogs.map((log) => {
                const items = workItemsMap[log.id] || []
                return (
                  <div key={log.id} className="space-y-0.5 mt-1">
                    <div className="flex items-center gap-1">
                      {teamMode && log.user_id && (
                        <span className="text-xs px-1 py-0 rounded bg-purple-100 text-purple-600" style={{ fontSize: 10 }}>
                          {userNameMap[log.user_id] || '?'}
                        </span>
                      )}
                      <span className={`w-2 h-2 rounded-full ${WORK_TYPE_STYLE[log.work_type] || 'bg-gray-400'}`} />
                      <span className="text-xs text-gray-500">{log.work_type}</span>
                      {log.field_hours && <span className="text-xs text-gray-400">{log.field_hours}h</span>}
                    </div>
                    {items.length > 0 && <p className="text-xs text-gray-400 pl-3 truncate">{items.map((it) => it.name).join('、')}</p>}
                  </div>
                )
              })}

              {isHovered && hasData && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-72 pointer-events-none"
                  style={{ minWidth: 280 }}>
                  <p className="text-sm font-bold text-gray-800 mb-2">
                    {format(d, 'M/d（E）', { locale: zhTW })}
                  </p>
                  {dayLogs.map((log) => {
                    const items = workItemsMap[log.id] || []
                    return (
                      <div key={log.id} className={`${dayLogs.length > 1 ? 'mb-3 pb-3 border-b border-gray-100 last:border-b-0 last:mb-0 last:pb-0' : ''}`}>
                        <div className="flex items-center gap-2 mb-1">
                          {teamMode && log.user_id && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 font-medium">
                              {userNameMap[log.user_id] || '?'}
                            </span>
                          )}
                          <span className={`w-2.5 h-2.5 rounded-full ${WORK_TYPE_STYLE[log.work_type] || 'bg-gray-400'}`} />
                          <span className="text-sm text-gray-600">{log.work_type}</span>
                        </div>
                        {log.field_hours && (
                          <p className="text-xs text-gray-500 mb-1">
                            🕐 {log.field_start?.substring(0, 5)}–{log.field_end?.substring(0, 5)}（{log.field_hours}h）
                          </p>
                        )}
                        {(log.field_locations || []).length > 0 && (
                          <p className="text-xs text-blue-500 mb-1">📍 {log.field_locations.join('、')}</p>
                        )}
                        {items.length > 0 && (
                          <div className="space-y-0.5">
                            {items.map((item) => (
                              <div key={item.id} className="flex items-start gap-1">
                                <span className="text-xs text-gray-400 mt-0.5">•</span>
                                <span className="text-xs text-gray-700">{item.name}</span>
                                {item.projects && <span className="text-xs text-blue-400 ml-1">[{item.projects.name}]</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {log.work_summary && (
                          <p className="text-xs text-gray-400 mt-1">💬 {log.work_summary}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ================================================================
   DailyLogModal — 日誌新增/編輯（保持不變）
   ================================================================ */

function DailyLogModal({ date, existingLog, onClose, visibleProjects }) {
  const dateStr = format(date, 'yyyy-MM-dd')
  const dateDisplay = format(date, 'yyyy 年 M 月 d 日（EEEE）', { locale: zhTW })

  const [form, setForm] = useState({
    work_type: '外勤', work_summary: '', field_start: '', field_end: '',
    field_hours: null, field_locations: [], work_items: [],
  })
  const [saving, setSaving] = useState(false)
  const [logId, setLogId] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function loadData() {
      if (existingLog) {
        setForm({
          work_type: existingLog.work_type || '外勤', work_summary: existingLog.work_summary || '',
          field_start: existingLog.field_start?.substring(0, 5) || '', field_end: existingLog.field_end?.substring(0, 5) || '',
          field_hours: existingLog.field_hours, field_locations: existingLog.field_locations || [], work_items: [],
        })
        setLogId(existingLog.id)
        try {
          const items = await getWorkItemsByLog(existingLog.id)
          setForm((prev) => ({ ...prev,
            work_items: items.length > 0 ? items.map((wi) => ({ name: wi.name, project_id: wi.project_id || '' })) : [{ name: '', project_id: '' }],
          }))
        } catch { setForm((prev) => ({ ...prev, work_items: [{ name: '', project_id: '' }] })) }
      } else {
        setForm({
          work_type: '外勤', work_summary: '', field_start: '09:00', field_end: '17:30',
          field_hours: calcFieldHours('09:00', '17:30'), field_locations: [], work_items: [{ name: '', project_id: '' }],
        })
        setLogId(null)
      }
      setLoaded(true)
    }
    loadData()
  }, [existingLog])

  function handleChange(f, v) {
    setForm((prev) => {
      const next = { ...prev, [f]: v }
      if (f === 'field_start' || f === 'field_end') {
        next.field_hours = calcFieldHours(f === 'field_start' ? v : prev.field_start, f === 'field_end' ? v : prev.field_end)
      }
      return next
    })
  }

  function handleItemChange(i, f, v) {
    setForm((prev) => { const items = [...prev.work_items]; items[i] = { ...items[i], [f]: v }; return { ...prev, work_items: items } })
  }
  function handleAddItem() { setForm((prev) => ({ ...prev, work_items: [...prev.work_items, { name: '', project_id: '' }] })) }
  function handleRemoveItem(i) { setForm((prev) => ({ ...prev, work_items: prev.work_items.filter((_, idx) => idx !== i) })) }

  async function handleSave() {
    setSaving(true)
    try {
      const sf = needsFieldInfo(form.work_type)
      const payload = {
        log_date: dateStr, work_type: form.work_type, work_summary: form.work_summary || null,
        field_start: sf ? (form.field_start || null) : null, field_end: sf ? (form.field_end || null) : null,
        field_hours: sf ? form.field_hours : null, field_locations: sf ? form.field_locations : [],
      }
      let savedLog = logId ? await updateLog(logId, payload) : await createLog(payload)
      const cleanItems = form.work_items.filter((it) => it.name && it.name.trim() !== '')
        .map((it) => ({ name: it.name.trim(), project_id: it.project_id || null, status: '已完成' }))
      await saveWorkItemsForLog(savedLog.id, cleanItems)
      toast.success(logId ? '日誌已更新' : '日誌已建立')
      onClose()
    } catch (err) { toast.error('儲存失敗：' + err.message) }
    setSaving(false)
  }

  async function handleDelete() {
    if (!logId) return
    if (!window.confirm('確定要刪除此日誌嗎？')) return
    try { await deleteLog(logId); toast.success('日誌已刪除'); onClose() }
    catch (err) { toast.error('刪除失敗：' + err.message) }
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
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">工作類型</label>
              <div className="flex gap-2">
                {WORK_TYPES.map((wt) => (
                  <button key={wt} type="button" onClick={() => handleChange('work_type', wt)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${form.work_type === wt ? WORK_TYPE_BTN[wt].active : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
                  >{wt}</button>
                ))}
              </div>
            </div>

            {showField && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">開始時間</label>
                  <input type="time" value={form.field_start} onChange={(e) => handleChange('field_start', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">結束時間</label>
                  <input type="time" value={form.field_end} onChange={(e) => handleChange('field_end', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">外勤時數</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
                    {form.field_hours != null ? `${form.field_hours} 小時` : '—'}
                  </div>
                </div>
              </div>
            )}

            {showField && (
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">外勤地點</label>
                <input type="text" value={(form.field_locations || []).join('、')}
                  onChange={(e) => handleChange('field_locations', e.target.value.split(/[,、]/).map((s) => s.trim()).filter(Boolean))}
                  placeholder="用頓號分隔，例：土城宏錩、桃園欣桃"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                工作項目
                {form.work_items.length > 0 && <span className="text-gray-400 font-normal ml-1">（{form.work_items.filter((it) => it.name.trim()).length} 條）</span>}
              </label>
              <div className="space-y-2">
                {form.work_items.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
                    <span className="text-xs text-gray-300 w-5 text-right pt-2.5">{idx + 1}.</span>
                    <div className="flex-1 space-y-1.5">
                      <input type="text" value={item.name} onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                        placeholder="輸入工作內容..."
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddItem() } }} />
                      <select value={item.project_id || ''} onChange={(e) => handleItemChange(idx, 'project_id', e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-500">
                        <option value="">— 無關聯案件 —</option>
                        {(visibleProjects || []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.type ? ` (${p.type})` : ''}</option>)}
                      </select>
                    </div>
                    {form.work_items.length > 1 && (
                      <button onClick={() => handleRemoveItem(idx)} className="text-xs text-red-400 hover:text-red-600 transition-colors px-1 pt-2.5">✕</button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={handleAddItem} className="mt-2 text-xs text-blue-600 hover:text-blue-700 transition-colors">＋ 新增工作項目</button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">補充備註</label>
              <textarea value={form.work_summary} rows={2} onChange={(e) => handleChange('work_summary', e.target.value)}
                placeholder="其他補充說明..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          {logId ? <button onClick={handleDelete} className="text-sm text-red-500 hover:text-red-700 transition-colors">刪除日誌</button> : <div />}
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">取消</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >{saving ? '儲存中...' : '儲存'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
