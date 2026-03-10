/**
 * 三合一工作總覽頁面
 * 版本: v1.2
 * 日期: 2026-03-10
 * 檔案: src/pages/WorkDashboard.jsx
 *
 * v1.2 修改：
 *  - PendingPanel：點擊項目開啟 WorkItemModal 編輯/刪除
 *  - PendingPanel：新增「＋」按鈕建立待辦
 *  - WorkItemModal：status='已完成' 時出現日期選擇器關聯日誌
 *  - WeekView：hover 行展開 + 字體放大 + 浮動詳情卡片
 *  - WeekView：假日/無資料行預設壓縮
 *
 * v1.1：日誌 status 預設已完成 + ProjectBar ＋/⋯ + ProjectModal
 * v1.0：三合一結構
 */

import { useState, useMemo, useEffect, useRef } from 'react'
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
  createLog, updateLog, deleteLog,
} from '../api/dailyLogs'
import {
  getWorkItems, getWorkItemsByLogIds, getWorkItemsByLog,
  saveWorkItemsForLog, createWorkItem, updateWorkItem, deleteWorkItem,
} from '../api/workItems'
import {
  getProjects, createProject, updateProject,
  updateProjectClients, archiveProject,
} from '../api/projects'
import { getClients } from '../api/clients'

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
  const [filterProjectId, setFilterProjectId] = useState(null)
  const [viewMode, setViewMode] = useState('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [pendingOpen, setPendingOpen] = useState(false)

  const [projectModalMode, setProjectModalMode] = useState(null)
  const [editingProject, setEditingProject] = useState(null)

  // ★ v1.2: 工作項目 Modal
  const [wiModalItem, setWiModalItem] = useState(undefined) // undefined=closed, null=create, object=edit

  const { data: projects, mutate: mutateProjects } = useSWR('projects', getProjects)
  const { data: allWorkItems, mutate: mutateWorkItems } = useSWR('all-work-items', getWorkItems)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd')

  const logSwrKey = viewMode === 'month' ? `logs-month-${year}-${month}` : `logs-week-${weekStartStr}`
  const logFetcher = viewMode === 'month' ? () => getLogsByMonth(year, month) : () => getLogsByRange(weekStartStr, weekEndStr)
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
    for (const log of logs) map[log.log_date] = log
    return map
  }, [logs])

  const projectItemCounts = useMemo(() => {
    const counts = {}
    if (!allWorkItems) return counts
    for (const wi of allWorkItems) { counts[wi.project_id || '_none'] = (counts[wi.project_id || '_none'] || 0) + 1 }
    return counts
  }, [allWorkItems])

  const pendingItems = useMemo(() => {
    if (!allWorkItems) return []
    let items = allWorkItems.filter((wi) => wi.status === '待處理' || wi.status === '進行中' || wi.status === '擱置')
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
  }, [allWorkItems, filterProjectId])

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

  const titleText = viewMode === 'month'
    ? format(currentDate, 'yyyy 年 M 月', { locale: zhTW })
    : `${format(weekStart, 'M/d', { locale: zhTW })} — ${format(weekEnd, 'M/d', { locale: zhTW })}`

  return (
    <div className="flex flex-col h-full">

      <ProjectBar
        projects={projects || []} itemCounts={projectItemCounts}
        filterProjectId={filterProjectId} onProjectClick={handleProjectClick}
        onCreate={handleCreateProject} onEdit={handleEditProject} onArchive={handleArchiveProject}
      />

      <div className="flex-1 overflow-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-800">工作日誌</h2>
            <p className="text-gray-400 text-xs mt-0.5">
              {titleText}
              {filterProjectId && (
                <span className="ml-2 text-blue-500">🔍 已篩選：{(projects || []).find((p) => p.id === filterProjectId)?.name || ''}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
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
          <WeekView weekStart={weekStart} logMap={logMap} workItemsMap={filteredWorkItemsMap} onDateClick={setSelectedDate} />
        ) : (
          <MonthView currentMonth={currentDate} logMap={logMap} workItemsMap={filteredWorkItemsMap} onDateClick={setSelectedDate} />
        )}
      </div>

      <PendingPanel
        items={pendingItems} overdueCount={overdueCount}
        isOpen={pendingOpen} onToggle={() => setPendingOpen((v) => !v)}
        onItemClick={(wi) => setWiModalItem(wi)}
        onCreateClick={() => setWiModalItem(null)}
      />

      {selectedDate && (
        <DailyLogModal date={selectedDate} existingLog={logMap[format(selectedDate, 'yyyy-MM-dd')]} onClose={handleDailyModalClose} />
      )}

      {projectModalMode && (
        <ProjectModal mode={projectModalMode} project={editingProject} onClose={handleProjectModalClose} />
      )}

      {wiModalItem !== undefined && (
        <WorkItemModal item={wiModalItem} onClose={handleWiModalClose} />
      )}
    </div>
  )
}

/* ================================================================
   上區：案件方塊列（v1.1 不變）
   ================================================================ */

function ProjectBar({ projects, itemCounts, filterProjectId, onProjectClick, onCreate, onEdit, onArchive }) {
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
   案件 Modal（v1.1 不變）
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
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">{isEdit ? '編輯案件' : '新增案件'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg transition-colors">✕</button>
        </div>
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">案件名稱 <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={(e) => handleChange('name', e.target.value)} placeholder="輸入案件名稱"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">案件分類</label>
            <div className="flex gap-2">
              {TYPE_OPTIONS.map((t) => (
                <button key={t} type="button" onClick={() => handleTypeChange(t)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${form.type === t ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
                >{PROJECT_TYPE_ICON[t]} {t}</button>
              ))}
            </div>
          </div>
          {showClientSelect && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">客戶</label>
              <div className="border border-gray-200 rounded-lg p-2 max-h-32 overflow-auto">
                {(clients || []).map((c) => (
                  <label key={c.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-sm transition-colors ${form.selectedClientIds.includes(c.id) ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-600'}`}>
                    <input type="checkbox" checked={form.selectedClientIds.includes(c.id)} onChange={() => toggleClient(c.id)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />{c.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          {isAutoClient && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">客戶</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">世曦（自動帶入）</div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">備註</label>
            <textarea value={form.notes} rows={3} onChange={(e) => handleChange('notes', e.target.value)} placeholder="補充說明..."
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
   ★ v1.2 中區：週視圖（hover 展開 + 浮動卡片 + 字體放大）
   ================================================================ */

function WeekView({ weekStart, logMap, workItemsMap, onDateClick }) {
  const [hoveredIdx, setHoveredIdx] = useState(null)
  const days = []
  for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i))

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {days.map((d, idx) => {
        const dateStr = format(d, 'yyyy-MM-dd')
        const log = logMap[dateStr]
        const today = isToday(d)
        const dayOfWeek = d.getDay()
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
        const items = log ? (workItemsMap[log.id] || []) : []
        const hasData = !!log
        const isHovered = hoveredIdx === idx

        // 預設高度：有資料 80px，無資料/假日 48px；hover 時自動展開
        const rowMinHeight = isHovered ? 120 : (hasData ? 80 : 48)

        return (
          <div key={dateStr}
            className="relative border-b border-gray-50 last:border-b-0"
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            {/* 主行 */}
            <div
              onClick={() => onDateClick(d)}
              className={`flex cursor-pointer transition-all duration-200 ${
                today ? 'bg-blue-50/50' : isHovered ? 'bg-blue-50/30' : ''
              }`}
              style={{ minHeight: rowMinHeight }}
            >
              {/* 左側日期 */}
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

              {/* 右側內容 */}
              <div className="flex-1 p-3">
                {!log ? (
                  <p className={`text-gray-300 pt-1 transition-all duration-200 ${isHovered ? 'text-sm' : 'text-xs'}`}>
                    點擊新增日誌
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-full ${WORK_TYPE_STYLE[log.work_type] || 'bg-gray-400'} ${isHovered ? 'w-2.5 h-2.5' : 'w-2 h-2'}`} />
                      <span className={`font-medium text-gray-600 transition-all duration-200 ${isHovered ? 'text-sm' : 'text-xs'}`}>
                        {log.work_type}
                      </span>
                      {log.field_hours && (
                        <span className={`text-gray-400 transition-all duration-200 ${isHovered ? 'text-sm' : 'text-xs'}`}>
                          {log.field_start?.substring(0, 5)}–{log.field_end?.substring(0, 5)}（{log.field_hours}h）
                        </span>
                      )}
                      {(log.field_locations || []).length > 0 && (
                        <span className={`text-blue-500 transition-all duration-200 ${isHovered ? 'text-sm' : 'text-xs'}`}>
                          📍 {log.field_locations.join('、')}
                        </span>
                      )}
                    </div>
                    {items.length > 0 && (
                      <div className="space-y-0.5 pl-4">
                        {items.map((item) => (
                          <p key={item.id} className={`text-gray-500 transition-all duration-200 ${isHovered ? 'text-sm' : 'text-xs'}`}>
                            • {item.name}
                            {item.projects && <span className="text-blue-400 ml-1">[{item.projects.name}]</span>}
                          </p>
                        ))}
                      </div>
                    )}
                    {log.work_summary && (
                      <p className={`text-gray-400 pl-4 transition-all duration-200 ${isHovered ? 'text-sm' : 'text-xs'}`}>
                        💬 {log.work_summary}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ★ 浮動詳情卡片 */}
            {isHovered && hasData && items.length > 0 && (
              <div className="absolute right-4 top-2 z-10 bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-72 pointer-events-none">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-3 h-3 rounded-full ${WORK_TYPE_STYLE[log.work_type] || 'bg-gray-400'}`} />
                  <span className="text-sm font-bold text-gray-800">
                    {format(d, 'M/d（E）', { locale: zhTW })}
                  </span>
                  <span className="text-sm text-gray-500">{log.work_type}</span>
                </div>
                {log.field_hours && (
                  <p className="text-sm text-gray-500 mb-1">
                    🕐 {log.field_start?.substring(0, 5)}–{log.field_end?.substring(0, 5)}（{log.field_hours}h）
                  </p>
                )}
                {(log.field_locations || []).length > 0 && (
                  <p className="text-sm text-blue-500 mb-2">📍 {log.field_locations.join('、')}</p>
                )}
                <div className="border-t border-gray-100 pt-2 space-y-1">
                  {items.map((item) => (
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
                {log.work_summary && (
                  <p className="text-sm text-gray-400 mt-2 pt-2 border-t border-gray-100">💬 {log.work_summary}</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ================================================================
   中區：月視圖（不變）
   ================================================================ */

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
          <div key={wd} className={`py-3 text-center text-xs font-medium ${i === 0 || i === 6 ? 'text-red-400' : 'text-gray-500'}`}>{wd}</div>
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
            <div key={dateStr} onClick={() => onDateClick(d)}
              className={`min-h-24 p-2 border-b border-r border-gray-50 cursor-pointer transition-colors ${inMonth ? 'hover:bg-blue-50' : 'bg-gray-50/50'}`}>
              <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${
                today ? 'bg-blue-600 text-white' : !inMonth ? 'text-gray-300' : isWeekend ? 'text-red-400' : 'text-gray-700'
              }`}>{format(d, 'd')}</span>
              {log && inMonth && (
                <div className="space-y-0.5 mt-1">
                  <div className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${WORK_TYPE_STYLE[log.work_type] || 'bg-gray-400'}`} />
                    <span className="text-xs text-gray-500">{log.work_type}</span>
                    {log.field_hours && <span className="text-xs text-gray-400">{log.field_hours}h</span>}
                  </div>
                  {items.length > 0 && <p className="text-xs text-gray-400 pl-3 truncate">{items.map((it) => it.name).join('、')}</p>}
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
   ★ v1.2 下區：待完成事項面板（可點擊 + 新增按鈕）
   ================================================================ */

const PRIORITY_BADGE = { '高': 'bg-red-100 text-red-600', '中': 'bg-amber-100 text-amber-600', '低': 'bg-gray-100 text-gray-500' }
const STATUS_BADGE = { '待處理': 'bg-gray-100 text-gray-600', '進行中': 'bg-blue-100 text-blue-600', '擱置': 'bg-amber-100 text-amber-600' }

function PendingPanel({ items, overdueCount, isOpen, onToggle, onItemClick, onCreateClick }) {
  return (
    <div className="border-t border-gray-200 bg-white">
      <div className="flex items-center justify-between px-5 py-3">
        <button onClick={onToggle} className="flex items-center gap-3 hover:opacity-70 transition-opacity">
          <span className="text-sm">{isOpen ? '▼' : '▶'}</span>
          <span className="text-sm font-medium text-gray-700">待完成事項</span>
          <span className="text-xs text-gray-400">
            {items.length} 項
            {overdueCount > 0 && <span className="text-red-500 ml-1">（逾期 {overdueCount} 項）</span>}
          </span>
        </button>
        <button onClick={onCreateClick}
          className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >＋ 新增待辦</button>
      </div>

      {isOpen && (
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
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_BADGE[wi.priority] || ''}`}>{wi.priority}</span>
                    <span className="flex-1 text-gray-700 truncate">{wi.name}</span>
                    {wi.projects && <span className="text-xs text-blue-400 flex-shrink-0">[{wi.projects.name}]</span>}
                    <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_BADGE[wi.status] || ''}`}>{wi.status}</span>
                    {wi.due_date && (
                      <span className={`text-xs flex-shrink-0 ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>{wi.due_date.substring(5)}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ================================================================
   ★ v1.2 工作項目 Modal（新增/編輯/刪除 + 完成日期關聯日誌）
   ================================================================ */

function WorkItemModal({ item, onClose }) {
  const isEdit = !!item
  const [form, setForm] = useState({
    name: '',
    status: '待處理',
    priority: '中',
    due_date: '',
    project_id: '',
    completion_date: format(new Date(), 'yyyy-MM-dd'),
  })
  const [saving, setSaving] = useState(false)

  const { data: projects } = useSWR('projects', getProjects)

  useEffect(() => {
    if (isEdit) {
      setForm({
        name: item.name || '',
        status: item.status || '待處理',
        priority: item.priority || '中',
        due_date: item.due_date || '',
        project_id: item.project_id || '',
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

      // ★ 完成 → 關聯到指定日期的日誌
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

          {/* 名稱 */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">名稱 <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={(e) => handleChange('name', e.target.value)}
              placeholder="輸入工作內容"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* 狀態 */}
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

          {/* ★ 完成日期（status=已完成 時出現） */}
          {form.status === '已完成' && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">完成日期（關聯到該日誌）</label>
              <input type="date" value={form.completion_date}
                onChange={(e) => handleChange('completion_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}

          {/* 優先級 */}
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

          {/* 到期日 */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">到期日</label>
            <input type="date" value={form.due_date} onChange={(e) => handleChange('due_date', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* 關聯案件 */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">關聯案件</label>
            <select value={form.project_id} onChange={(e) => handleChange('project_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— 無 —</option>
              {(projects || []).map((p) => (
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
   日誌 Modal（不變）
   ================================================================ */

function DailyLogModal({ date, existingLog, onClose }) {
  const dateStr = format(date, 'yyyy-MM-dd')
  const dateDisplay = format(date, 'yyyy 年 M 月 d 日（EEEE）', { locale: zhTW })

  const [form, setForm] = useState({
    work_type: '外勤', work_summary: '', field_start: '', field_end: '',
    field_hours: null, field_locations: [], work_items: [],
  })
  const [saving, setSaving] = useState(false)
  const [logId, setLogId] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const { data: projects } = useSWR('projects', getProjects)

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
                        {(projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.type ? ` (${p.type})` : ''}</option>)}
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
