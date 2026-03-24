/**
 * 三合一工作總覽頁面
 * 版本: v1.6
 * 日期: 2026-03-24
 * 檔案: src/pages/WorkDashboard.jsx
 *
 * v1.6：工作日誌多人顯示優化
 *       - logMap 結構改為 {日期: [log...]} 陣列，修復團隊模式同日多人只顯示最後一筆
 *       - WeekView：多人同日橫向排列區塊 + hover 切換顯示詳情
 *       - MonthView：加 hover popup 彈出詳情 + 多人各自摘要
 *       - DailyLogModal 入口：個人模式取自己的日誌，避免誤編他人
 * v1.5：P10 案件可見性 — admin限制(user_projects) + 使用者自訂(hidden_projects) 兩層篩選
 *       ProjectBar 加「👁 顯示/隱藏」按鈕 + VisibilityModal
 * v1.4：boss/admin 檢視模式（我的 / 全員）+ 使用者篩選 + 唯讀防護
 * v1.3：PendingPanel hover + ✓快速完成 popup
 * v1.2：WorkItemModal + 完成日期關聯日誌 + WeekView hover
 * v1.1：日誌 status 預設已完成 + ProjectBar ＋/⋯ + ProjectModal
 * v1.0：三合一結構
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
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
  getWorkItems, getWorkItemsByLogIds, getWorkItemsByLog,
  getAllUsersWorkItems,
  saveWorkItemsForLog, createWorkItem, updateWorkItem, deleteWorkItem,
} from '../api/workItems'
import {
  getProjects, getVisibleProjects, getAllowedProjects, updateHiddenProjects,
  createProject, updateProject,
  updateProjectClients, archiveProject,
} from '../api/projects'
import { getClients } from '../api/clients'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

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
const PRIORITY_ORDER = { '高': 0, '中': 1, '低': 2 }

const PROJECT_TYPE_ICON = {
  'iroad': '📷', '世曦攝影機': '🎥', '地動儀': '🔬', '日常工作': '📝',
}

const TYPE_OPTIONS = ['iroad', '世曦攝影機', '地動儀', '日常工作']
const TYPE_NEEDS_CLIENT = { 'iroad': true, '世曦攝影機': false, '地動儀': true, '日常工作': false }

const STATUS_OPTIONS = ['待處理', '進行中', '已完成', '擱置']
const PRIORITY_OPTIONS = ['高', '中', '低']

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
  const { user, profile, canViewAll, refreshProfile } = useAuth()
  const [filterProjectId, setFilterProjectId] = useState(null)
  const [viewMode, setViewMode] = useState('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)

  const [projectModalMode, setProjectModalMode] = useState(null)
  const [editingProject, setEditingProject] = useState(null)

  const [wiModalItem, setWiModalItem] = useState(undefined)

  // ★ v1.4：boss 檢視模式
  const [teamMode, setTeamMode] = useState(false)
  const [filterUserId, setFilterUserId] = useState('')

  // ★ v1.5：顯示/隱藏案件 Modal
  const [showVisibilityModal, setShowVisibilityModal] = useState(false)

  // 拉 profiles 列表（boss/admin 才需要）
  const { data: profilesList } = useSWR(
    canViewAll ? 'profiles-list' : null,
    async () => {
      const { data, error } = await supabase.from('profiles').select('id, display_name, role').order('created_at')
      if (error) throw error
      return data || []
    }
  )

  const userNameMap = useMemo(() => {
    const map = {}
    if (profilesList) {
      for (const p of profilesList) map[p.id] = p.display_name || p.id.substring(0, 8)
    }
    return map
  }, [profilesList])

  // ★ v1.5：用 getVisibleProjects 取代 getProjects（兩層篩選）
  const visibleProjectsKey = user?.id ? `visible-projects-${user.id}-${JSON.stringify(profile?.hidden_projects || [])}` : null
  const { data: projects, mutate: mutateProjects } = useSWR(
    visibleProjectsKey,
    () => getVisibleProjects(user.id, profile)
  )

  // ★ v1.4：根據 teamMode 決定拉自己的還是全員的 workItems
  const workItemsSwrKey = teamMode ? `all-work-items-team-${filterUserId}` : 'all-work-items'
  const workItemsFetcher = teamMode
    ? () => getAllUsersWorkItems(filterUserId || null)
    : () => getWorkItems()
  const { data: allWorkItems, mutate: mutateWorkItems } = useSWR(workItemsSwrKey, workItemsFetcher)

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

  // ★ v1.6：logMap 改為陣列格式，支援同日多人日誌
  const logMap = useMemo(() => {
    const map = {}
    if (!logs) return map
    for (const log of logs) {
      if (!map[log.log_date]) map[log.log_date] = []
      map[log.log_date].push(log)
    }
    return map
  }, [logs])

  // ★ v1.5：用 visibleProjects 的 ID 集合做 workItems 篩選
  const visibleProjectIds = useMemo(() => {
    return new Set((projects || []).map((p) => p.id))
  }, [projects])

  const projectItemCounts = useMemo(() => {
    const counts = {}
    if (!allWorkItems) return counts
    for (const wi of allWorkItems) {
      // ★ v1.5：只計算可見案件的項目（無案件的也計算）
      if (wi.project_id && !visibleProjectIds.has(wi.project_id)) continue
      counts[wi.project_id || '_none'] = (counts[wi.project_id || '_none'] || 0) + 1
    }
    return counts
  }, [allWorkItems, visibleProjectIds])

  const pendingItems = useMemo(() => {
    if (!allWorkItems) return []
    let items = allWorkItems.filter((wi) => wi.status === '待處理' || wi.status === '進行中' || wi.status === '擱置')
    // ★ v1.5：只顯示可見案件的待辦（無案件的也顯示）
    items = items.filter((wi) => !wi.project_id || visibleProjectIds.has(wi.project_id))
    if (filterProjectId) items = items.filter((wi) => wi.project_id === filterProjectId)
    items.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 9, pb = PRIORITY_ORDER[b.priority] ?? 9
      if (pa !== pb) return pa - pb
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return 0
    })
    return items
  }, [allWorkItems, filterProjectId, visibleProjectIds])

  const overdueCount = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    return pendingItems.filter((wi) => wi.due_date && wi.due_date < today).length
  }, [pendingItems])

  const filteredWorkItemsMap = useMemo(() => {
    if (!filterProjectId) return workItemsMap
    const map = {}
    for (const [lid, items] of Object.entries(workItemsMap)) {
      const f = items.filter((wi) => wi.project_id === filterProjectId)
      if (f.length > 0) map[lid] = f
    }
    return map
  }, [workItemsMap, filterProjectId])

  // ★ v1.4：判斷是否唯讀
  const isReadOnly = teamMode && filterUserId && filterUserId !== user?.id

  /* --- handlers --- */

  function handleProjectClick(pid) { setFilterProjectId((prev) => (prev === pid ? null : pid)) }
  function handleCreateProject() { setEditingProject(null); setProjectModalMode('create') }
  function handleEditProject(p) { setEditingProject(p); setProjectModalMode('edit') }

  async function handleArchiveProject(p) {
    if (!window.confirm(`確定要隱藏「${p.name}」嗎？`)) return
    try {
      await archiveProject(p.id, true)
      if (filterProjectId === p.id) setFilterProjectId(null)
      mutateProjects(); toast.success(`「${p.name}」已隱藏`)
    } catch (err) { toast.error('隱藏失敗：' + err.message) }
  }

  function handleProjectModalClose() { setProjectModalMode(null); setEditingProject(null); mutateProjects() }

  function handlePrev() { viewMode === 'month' ? setCurrentDate(subMonths(currentDate, 1)) : setCurrentDate(subWeeks(currentDate, 1)) }
  function handleNext() { viewMode === 'month' ? setCurrentDate(addMonths(currentDate, 1)) : setCurrentDate(addWeeks(currentDate, 1)) }
  function handleToday() { setCurrentDate(new Date()) }

  function handleDailyModalClose() { setSelectedDate(null); mutateLogs(); mutateWorkItems() }

  function handleWiModalClose() { setWiModalItem(undefined); mutateWorkItems(); mutateLogs() }

  async function handleCompleteItem(wi, completionDate) {
    if (isReadOnly) { toast.error('唯讀模式：不能修改他人資料'); return }
    try {
      let log = await getLogByDate(completionDate)
      if (!log) {
        log = await createLog({ log_date: completionDate, work_type: '內勤' })
        toast('已自動建立 ' + completionDate + ' 日誌', { icon: '📝' })
      }
      await updateWorkItem(wi.id, { ...wi, status: '已完成', log_id: log.id, project_id: wi.project_id || null })
      toast.success(`「${wi.name}」已完成`)
      mutateWorkItems(); mutateLogs()
    } catch (err) { toast.error('完成失敗：' + err.message) }
  }

  function handleToggleTeamMode() {
    setTeamMode((prev) => !prev)
    setFilterUserId('')
  }

  // ★ v1.5：VisibilityModal 儲存後重新載入 profile + 案件
  async function handleVisibilityClose() {
    setShowVisibilityModal(false)
    await refreshProfile()
    mutateProjects()
  }

  const titleText = viewMode === 'month'
    ? format(currentDate, 'yyyy 年 M 月', { locale: zhTW })
    : `${format(weekStart, 'M/d', { locale: zhTW })} — ${format(weekEnd, 'M/d', { locale: zhTW })}`

  return (
    <div className="flex flex-col h-full">

      <ProjectBar
        projects={projects || []} itemCounts={projectItemCounts}
        filterProjectId={filterProjectId} onProjectClick={handleProjectClick}
        onCreate={handleCreateProject} onEdit={handleEditProject} onArchive={handleArchiveProject}
        onVisibility={() => setShowVisibilityModal(true)}
      />

      <div className="flex-1 overflow-auto p-5">
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
                <span className="ml-2 text-blue-500">🔍 已篩選：{(projects || []).find((p) => p.id === filterProjectId)?.name || ''}</span>
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

      <PendingPanel
        items={pendingItems} overdueCount={overdueCount}
        onItemClick={(wi) => { if (!isReadOnly) setWiModalItem(wi) }}
        onCreateClick={() => { if (isReadOnly) { toast.error('唯讀模式：不能新增他人待辦'); return }; setWiModalItem(null) }}
        onComplete={handleCompleteItem}
        teamMode={teamMode} userNameMap={userNameMap}
        isReadOnly={isReadOnly}
      />

      {selectedDate && !isReadOnly && (
        <DailyLogModal date={selectedDate}
          existingLog={(() => {
            const logsForDate = logMap[format(selectedDate, 'yyyy-MM-dd')] || []
            return logsForDate.find((l) => l.user_id === user?.id) || (logsForDate.length === 1 && !teamMode ? logsForDate[0] : null)
          })()}
          onClose={handleDailyModalClose} visibleProjects={projects || []} />
      )}

      {projectModalMode && (
        <ProjectModal mode={projectModalMode} project={editingProject} onClose={handleProjectModalClose} />
      )}

      {wiModalItem !== undefined && !isReadOnly && (
        <WorkItemModal item={wiModalItem} onClose={handleWiModalClose} visibleProjects={projects || []} />
      )}

      {/* ★ v1.5：顯示/隱藏案件 Modal */}
      {showVisibilityModal && user && (
        <VisibilityModal userId={user.id} profile={profile} onClose={handleVisibilityClose} />
      )}
    </div>
  )
}

/* ================================================================
   ★ v1.5 上區：案件方塊列（加 onVisibility）
   ================================================================ */

function ProjectBar({ projects, itemCounts, filterProjectId, onProjectClick, onCreate, onEdit, onArchive, onVisibility }) {
  const [hovered, setHovered] = useState(false)
  const totalItems = Object.values(itemCounts).reduce((sum, n) => sum + n, 0)

  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      className="border-b border-gray-200 bg-white transition-all duration-200 ease-in-out"
      style={{ minHeight: hovered ? 120 : 48 }}
    >
      <div className="flex items-center justify-between px-5 h-12">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600">案件總覽</span>
          <span className="text-xs text-gray-400">（{projects.length} 案件，{totalItems} 工作項目）</span>
        </div>
        <div className="flex items-center gap-2">
          {filterProjectId && (
            <button onClick={() => onProjectClick(filterProjectId)} className="text-xs text-blue-500 hover:text-blue-700 transition-colors">✕ 取消篩選</button>
          )}
          {/* ★ v1.5：顯示/隱藏案件按鈕 */}
          <button onClick={onVisibility}
            className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
            title="設定要顯示哪些案件"
          >👁 篩選</button>
          <button onClick={onCreate} className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">＋ 新增案件</button>
        </div>
      </div>
      <div className="overflow-hidden transition-all duration-200 ease-in-out" style={{ maxHeight: hovered ? 300 : 0, opacity: hovered ? 1 : 0 }}>
        <div className="flex gap-3 px-5 pb-4 overflow-x-auto">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} count={itemCounts[p.id] || 0} isActive={filterProjectId === p.id}
              onFilter={() => onProjectClick(p.id)} onEdit={() => onEdit(p)} onArchive={() => onArchive(p)} />
          ))}
          {projects.length === 0 && <p className="text-xs text-gray-300 py-2">尚無案件，點右上角新增</p>}
        </div>
      </div>
    </div>
  )
}

function ProjectCard({ project, count, isActive, onFilter, onEdit, onArchive }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    function h(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

  return (
    <div className={`relative flex-shrink-0 w-44 p-3 rounded-xl border-2 cursor-pointer transition-all duration-150 ${
      isActive ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-100 bg-gray-50 hover:border-gray-300 hover:shadow-sm'
    }`}>
      <div ref={menuRef} className="absolute top-1.5 right-1.5">
        <button onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors text-xs">⋯</button>
        {menuOpen && (
          <div className="absolute right-0 top-7 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20 w-28">
            <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit() }}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">編輯</button>
            <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onArchive() }}
              className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 transition-colors">隱藏</button>
          </div>
        )}
      </div>
      <div onClick={onFilter}>
        <div className="flex items-center gap-2 mb-1.5 pr-6">
          <span className="text-base">{PROJECT_TYPE_ICON[project.type] || '📁'}</span>
          <span className="text-sm font-medium text-gray-800 truncate">{project.name}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{project.type || '未分類'}</span>
          <span className={`text-xs font-medium ${count > 0 ? 'text-blue-600' : 'text-gray-300'}`}>{count} 項</span>
        </div>
        {project.clients && project.clients.length > 0 && (
          <p className="text-xs text-gray-400 mt-1 truncate">{project.clients.map((c) => c.name).join('、')}</p>
        )}
      </div>
    </div>
  )
}

/* ================================================================
   ★ v1.5 新增：顯示/隱藏案件 Modal
   ================================================================ */

function VisibilityModal({ userId, profile, onClose }) {
  const [allowedProjects, setAllowedProjects] = useState([])
  const [hiddenIds, setHiddenIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const allowed = await getAllowedProjects(userId)
        setAllowedProjects(allowed)
        setHiddenIds(profile?.hidden_projects || [])
      } catch (err) {
        console.warn('[VisibilityModal] 載入失敗:', err.message)
        toast.error('載入失敗')
      }
      setLoading(false)
    }
    load()
  }, [userId, profile])

  function toggleProject(pid) {
    setHiddenIds((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
    )
  }

  function handleSelectAll() { setHiddenIds([]) }
  function handleDeselectAll() { setHiddenIds(allowedProjects.map((p) => p.id)) }

  async function handleSave() {
    setSaving(true)
    try {
      // 只保留 allowedProjects 範圍內的 hiddenIds（避免殘留已移除案件的 ID）
      const validHidden = hiddenIds.filter((id) => allowedProjects.some((p) => p.id === id))
      await updateHiddenProjects(userId, validHidden)
      toast.success('案件顯示設定已儲存')
      onClose()
    } catch (err) {
      toast.error('儲存失敗：' + err.message)
    }
    setSaving(false)
  }

  const visibleCount = allowedProjects.length - hiddenIds.filter((id) => allowedProjects.some((p) => p.id === id)).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-800">案件顯示設定</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              勾選要在工作總覽顯示的案件（{visibleCount}/{allowedProjects.length}）
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <p className="text-center text-gray-400 text-sm py-8">載入中...</p>
          ) : allowedProjects.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">無可用案件</p>
          ) : (
            <>
              <div className="flex gap-2 mb-3">
                <button onClick={handleSelectAll}
                  className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors">全選</button>
                <button onClick={handleDeselectAll}
                  className="text-xs px-2 py-1 bg-gray-50 text-gray-500 rounded hover:bg-gray-100 transition-colors">全不選</button>
              </div>
              <div className="space-y-1">
                {allowedProjects.map((p) => {
                  const isHidden = hiddenIds.includes(p.id)
                  return (
                    <label key={p.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                        isHidden ? 'bg-gray-50 opacity-60' : 'bg-white hover:bg-blue-50'
                      }`}
                    >
                      <input type="checkbox" checked={!isHidden} onChange={() => toggleProject(p.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      <span className="text-base">{PROJECT_TYPE_ICON[p.type] || '📁'}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-800">{p.name}</span>
                        {p.type && <span className="text-xs text-gray-400 ml-2">{p.type}</span>}
                        {p.clients && p.clients.length > 0 && (
                          <p className="text-xs text-gray-400 truncate">{p.clients.map((c) => c.name).join('、')}</p>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">取消</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >{saving ? '儲存中...' : '儲存'}</button>
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   案件 Modal（不變）
   ================================================================ */

function ProjectModal({ mode, project, onClose }) {
  const isEdit = mode === 'edit'
  const [form, setForm] = useState({ name: '', type: '', notes: '', selectedClientIds: [] })
  const [saving, setSaving] = useState(false)
  const { data: clients } = useSWR('clients', getClients)

  useEffect(() => {
    if (isEdit && project) {
      setForm({ name: project.name || '', type: project.type || '', notes: project.notes || '',
        selectedClientIds: (project.clients || []).map((c) => c.id) })
    }
  }, [isEdit, project])

  function handleChange(f, v) { setForm((prev) => ({ ...prev, [f]: v })) }

  function handleTypeChange(t) {
    const u = { type: t }
    if (t === '世曦攝影機') { const sx = (clients || []).find((c) => c.name === '世曦'); u.selectedClientIds = sx ? [sx.id] : [] }
    else if (t === '日常工作') u.selectedClientIds = []
    else if (t !== form.type) u.selectedClientIds = []
    setForm((prev) => ({ ...prev, ...u }))
  }

  function toggleClient(cid) {
    setForm((prev) => ({ ...prev, selectedClientIds: prev.selectedClientIds.includes(cid) ? prev.selectedClientIds.filter((id) => id !== cid) : [...prev.selectedClientIds, cid] }))
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('案件名稱不可為空'); return }
    setSaving(true)
    try {
      if (isEdit) {
        await updateProject(project.id, { name: form.name.trim(), type: form.type || null, notes: form.notes || null })
        await updateProjectClients(project.id, form.selectedClientIds)
        toast.success('案件已更新')
      } else {
        const created = await createProject({ name: form.name.trim(), type: form.type || null, notes: form.notes || null })
        if (form.selectedClientIds.length > 0) await updateProjectClients(created.id, form.selectedClientIds)
        toast.success('案件已新增')
      }
      onClose()
    } catch (err) { toast.error('儲存失敗：' + err.message) }
    setSaving(false)
  }

  const showClientSelect = TYPE_NEEDS_CLIENT[form.type]
  const isAutoClient = form.type === '世曦攝影機'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">{isEdit ? '編輯案件' : '新增案件'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg transition-colors">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">案件名稱 <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={(e) => handleChange('name', e.target.value)} placeholder="輸入案件名稱"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">分類</label>
            <div className="flex gap-2 flex-wrap">
              {TYPE_OPTIONS.map((t) => (
                <button key={t} type="button" onClick={() => handleTypeChange(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    form.type === t ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-300' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                  }`}
                >{PROJECT_TYPE_ICON[t]} {t}</button>
              ))}
            </div>
          </div>
          {showClientSelect && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                {isAutoClient ? '客戶（自動）' : '選擇客戶'}
              </label>
              <div className="max-h-40 overflow-auto border border-gray-200 rounded-lg p-2 space-y-1">
                {(clients || []).map((c) => (
                  <label key={c.id} className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-gray-50 ${isAutoClient ? 'opacity-50 pointer-events-none' : ''}`}>
                    <input type="checkbox" checked={form.selectedClientIds.includes(c.id)} onChange={() => toggleClient(c.id)} disabled={isAutoClient}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600" />
                    <span className="text-sm text-gray-700">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">備註</label>
            <textarea value={form.notes} rows={2} onChange={(e) => handleChange('notes', e.target.value)} placeholder="備註..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">取消</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">{saving ? '儲存中...' : '儲存'}</button>
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   ★ v1.6 中區：週視圖（logMap 陣列 + 團隊多人橫排 + hover popup）
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
              {/* 左側日期區塊 */}
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

              {/* 右側內容區塊 */}
              <div className="flex-1 p-3">
                {!hasData ? (
                  <p className={`text-gray-300 pt-1 transition-all duration-200 ${isHovered ? 'text-sm' : 'text-xs'}`}>
                    {teamMode ? '' : '點擊新增日誌'}
                  </p>
                ) : dayLogs.length === 1 ? (
                  /* 單人：維持原本排版 */
                  <WeekDayLogBlock log={dayLogs[0]} items={workItemsMap[dayLogs[0].id] || []}
                    isHovered={isHovered} teamMode={teamMode} userNameMap={userNameMap}
                    onHoverLog={setHoveredLogId} />
                ) : (
                  /* 多人：橫向排列 */
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

            {/* Hover popup：顯示被 hover 的那筆 log 詳情 */}
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

/** 週視圖中單筆日誌的行內顯示區塊（提取為子元件避免重複） */
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
   ★ v1.6 中區：月視圖（logMap 陣列 + hover popup + 多人摘要）
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

              {/* 格子內摘要 */}
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

              {/* Hover popup */}
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
   ★ v1.4 下區：待完成事項面板（加 teamMode 人名 + 唯讀防護）
   ================================================================ */

const PRIORITY_BADGE = { '高': 'bg-red-100 text-red-600', '中': 'bg-amber-100 text-amber-600', '低': 'bg-gray-100 text-gray-500' }
const STATUS_BADGE = { '待處理': 'bg-gray-100 text-gray-600', '進行中': 'bg-blue-100 text-blue-600', '擱置': 'bg-amber-100 text-amber-600' }

function PendingPanel({ items, overdueCount, onItemClick, onCreateClick, onComplete, teamMode, userNameMap, isReadOnly }) {
  const [hovered, setHovered] = useState(false)
  const [completingItem, setCompletingItem] = useState(null)
  const [completionDate, setCompletionDate] = useState('')

  function handleCheckClick(e, wi) {
    e.stopPropagation()
    if (isReadOnly) { toast.error('唯讀模式：不能修改他人資料'); return }
    setCompletionDate(format(new Date(), 'yyyy-MM-dd'))
    setCompletingItem(wi)
  }

  function handleConfirmComplete() {
    if (!completionDate || !completingItem) return
    onComplete(completingItem, completionDate)
    setCompletingItem(null)
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="border-t border-gray-200 bg-white transition-all duration-200 ease-in-out"
    >
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm">{hovered ? '▼' : '▶'}</span>
          <span className="text-sm font-medium text-gray-700">待完成事項</span>
          <span className="text-xs text-gray-400">
            {items.length} 項
            {overdueCount > 0 && <span className="text-red-500 ml-1">（逾期 {overdueCount} 項）</span>}
          </span>
        </div>
        {!isReadOnly && (
          <button onClick={onCreateClick}
            className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >＋ 新增待辦</button>
        )}
      </div>

      <div className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{ maxHeight: hovered ? 320 : 0, opacity: hovered ? 1 : 0 }}
      >
        <div className="max-h-64 overflow-auto px-5 pb-4">
          {items.length === 0 ? (
            <p className="text-xs text-gray-300 py-4 text-center">沒有待完成項目 🎉</p>
          ) : (
            <div className="space-y-1.5">
              {items.map((wi) => {
                const todayStr = format(new Date(), 'yyyy-MM-dd')
                const isOverdue = wi.due_date && wi.due_date < todayStr
                return (
                  <div key={wi.id} onClick={() => onItemClick(wi)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors hover:ring-1 hover:ring-blue-300 ${isOverdue ? 'bg-red-50' : 'bg-gray-50 hover:bg-blue-50'}`}
                  >
                    {teamMode && wi.user_id && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 font-medium flex-shrink-0">
                        {userNameMap[wi.user_id] || '?'}
                      </span>
                    )}
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_BADGE[wi.priority] || ''}`}>{wi.priority}</span>
                    <span className="flex-1 text-gray-700 truncate">{wi.name}</span>
                    {wi.projects && <span className="text-xs text-blue-400 flex-shrink-0">[{wi.projects.name}]</span>}
                    <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_BADGE[wi.status] || ''}`}>{wi.status}</span>
                    {wi.due_date && (
                      <span className={`text-xs flex-shrink-0 ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>{wi.due_date.substring(5)}</span>
                    )}
                    {!isReadOnly && (
                      <button onClick={(e) => handleCheckClick(e, wi)}
                        className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-green-500 hover:bg-green-100 hover:text-green-700 transition-colors text-base"
                        title="標記完成"
                      >✓</button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {completingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setCompletingItem(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-72 p-5">
            <p className="text-sm font-bold text-gray-800 mb-1">標記完成</p>
            <p className="text-xs text-gray-500 mb-4 truncate">「{completingItem.name}」</p>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">完成日期</label>
            <input type="date" value={completionDate}
              onChange={(e) => setCompletionDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setCompletingItem(null)}
                className="flex-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
              <button onClick={handleConfirmComplete}
                className="flex-1 px-3 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors">確認完成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ================================================================
   ★ v1.5 工作項目 Modal（接收 visibleProjects prop）
   ================================================================ */

function WorkItemModal({ item, onClose, visibleProjects }) {
  const isEdit = !!item
  const [form, setForm] = useState({
    name: '', status: '待處理', priority: '中', due_date: '', project_id: '', completion_date: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isEdit && item) {
      setForm({
        name: item.name || '', status: item.status || '待處理', priority: item.priority || '中',
        due_date: item.due_date || '', project_id: item.project_id || '',
        completion_date: format(new Date(), 'yyyy-MM-dd'),
      })
    }
  }, [isEdit, item])

  function handleChange(f, v) { setForm((prev) => ({ ...prev, [f]: v })) }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('名稱不可為空'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        status: form.status,
        priority: form.priority,
        due_date: form.due_date || null,
        project_id: form.project_id || null,
      }

      if (form.status === '已完成' && form.completion_date) {
        let log = await getLogByDate(form.completion_date)
        if (!log) {
          log = await createLog({ log_date: form.completion_date, work_type: '內勤' })
          toast('已自動建立 ' + form.completion_date + ' 日誌', { icon: '📝' })
        }
        payload.log_id = log.id
      }

      if (isEdit) {
        await updateWorkItem(item.id, payload)
        toast.success('已更新')
      } else {
        await createWorkItem(payload)
        toast.success('已新增')
      }
      onClose()
    } catch (err) { toast.error('儲存失敗：' + err.message) }
    setSaving(false)
  }

  async function handleDelete() {
    if (!isEdit) return
    if (!window.confirm(`確定要刪除「${item.name}」嗎？`)) return
    try {
      await deleteWorkItem(item.id)
      toast.success('已刪除')
      onClose()
    } catch (err) { toast.error('刪除失敗：' + err.message) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">{isEdit ? '編輯工作項目' : '新增待辦'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg transition-colors">✕</button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">名稱 <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={(e) => handleChange('name', e.target.value)}
              placeholder="輸入工作內容"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">狀態</label>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map((s) => (
                <button key={s} type="button" onClick={() => handleChange('status', s)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    form.status === s
                      ? s === '已完成' ? 'bg-green-100 text-green-700 ring-1 ring-green-300'
                      : s === '進行中' ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                      : s === '擱置' ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300'
                      : 'bg-gray-100 text-gray-700 ring-1 ring-gray-300'
                      : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                  }`}
                >{s}</button>
              ))}
            </div>
          </div>

          {form.status === '已完成' && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">完成日期（關聯到該日誌）</label>
              <input type="date" value={form.completion_date}
                onChange={(e) => handleChange('completion_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">優先級</label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((p) => (
                <button key={p} type="button" onClick={() => handleChange('priority', p)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.priority === p
                      ? p === '高' ? 'bg-red-100 text-red-700 ring-1 ring-red-300'
                      : p === '中' ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300'
                      : 'bg-gray-100 text-gray-600 ring-1 ring-gray-300'
                      : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                  }`}
                >{p}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">到期日</label>
            <input type="date" value={form.due_date} onChange={(e) => handleChange('due_date', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">關聯案件</label>
            <select value={form.project_id} onChange={(e) => handleChange('project_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— 無 —</option>
              {(visibleProjects || []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.type ? ` (${p.type})` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          {isEdit ? (
            <button onClick={handleDelete} className="text-sm text-red-500 hover:text-red-700 transition-colors">刪除</button>
          ) : <div />}
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

/* ================================================================
   ★ v1.5 日誌 Modal（接收 visibleProjects prop）
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
