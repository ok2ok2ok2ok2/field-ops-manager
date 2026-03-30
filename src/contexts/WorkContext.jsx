/**
 * 工作全域 Context — 案件 + 待辦 + boss模式 共享 state
 * 版本: v1.0
 * 日期: 2026-03-27
 * 檔案: src/contexts/WorkContext.jsx
 *
 * v1.0：從 WorkDashboard 抽出 ProjectBar / PendingPanel 所需的
 *       projects、workItems、teamMode、filterProjectId 等 state，
 *       讓所有頁面都能透過 useWork() 存取。
 *
 * 依賴：AuthContext（user, profile, canViewAll, refreshProfile）
 */

import { createContext, useContext, useState, useMemo, useCallback } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  getVisibleProjects, getAllowedProjects, updateHiddenProjects,
  createProject, updateProject,
  updateProjectClients, archiveProject,
} from '../api/projects'
import { getClients } from '../api/clients'
import {
  getWorkItems, getAllUsersWorkItems,
  createWorkItem, updateWorkItem, deleteWorkItem,
} from '../api/workItems'
import { getLogByDate, createLog } from '../api/dailyLogs'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'

/* ========== 常數（與 WorkDashboard 共用） ========== */

const PRIORITY_ORDER = { '高': 0, '中': 1, '低': 2 }
const PROJECT_TYPE_ICON = {
  'iroad': '📷', '世曦攝影機': '🎥', '地動儀': '🔬', '日常工作': '📝',
}
const TYPE_OPTIONS = ['iroad', '世曦攝影機', '地動儀', '日常工作']
const TYPE_NEEDS_CLIENT = { 'iroad': true, '世曦攝影機': false, '地動儀': true, '日常工作': false }
const STATUS_OPTIONS = ['待處理', '進行中', '已完成', '擱置']
const PRIORITY_OPTIONS = ['高', '中', '低']

/* ========== Context ========== */

const WorkContext = createContext(null)

export function WorkProvider({ children }) {
  const { user, profile, canViewAll, refreshProfile } = useAuth()

  // ── 篩選 state ──
  const [filterProjectId, setFilterProjectId] = useState(null)

  // ── boss 模式 ──
  const [teamMode, setTeamMode] = useState(false)
  const [filterUserId, setFilterUserId] = useState('')

  // ── Modal 開關 ──
  const [projectModalMode, setProjectModalMode] = useState(null)   // null | 'create' | 'edit'
  const [editingProject, setEditingProject] = useState(null)
  const [wiModalItem, setWiModalItem] = useState(undefined)        // undefined=關閉, null=新增, object=編輯
  const [showVisibilityModal, setShowVisibilityModal] = useState(false)

  // ── SWR：profiles 列表（boss/admin） ──
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

  // ── SWR：可見案件 ──
  const visibleProjectsKey = user?.id
    ? `visible-projects-${user.id}-${JSON.stringify(profile?.hidden_projects || [])}`
    : null
  const { data: projects, mutate: mutateProjects } = useSWR(
    visibleProjectsKey,
    () => getVisibleProjects(user.id, profile)
  )

  // ── SWR：工作項目 ──
  const workItemsSwrKey = teamMode
    ? `all-work-items-team-${filterUserId}`
    : 'all-work-items'
  const workItemsFetcher = teamMode
    ? () => getAllUsersWorkItems(filterUserId || null)
    : () => getWorkItems()
  const { data: allWorkItems, mutate: mutateWorkItems } = useSWR(workItemsSwrKey, workItemsFetcher)

  // ── 衍生：可見 project ID 集合 ──
  const visibleProjectIds = useMemo(() => {
    return new Set((projects || []).map((p) => p.id))
  }, [projects])

  // ── 衍生：案件方塊的工作項目計數 ──
  const projectItemCounts = useMemo(() => {
    const counts = {}
    if (!allWorkItems) return counts
    for (const wi of allWorkItems) {
      if (wi.project_id && !visibleProjectIds.has(wi.project_id)) continue
      counts[wi.project_id || '_none'] = (counts[wi.project_id || '_none'] || 0) + 1
    }
    return counts
  }, [allWorkItems, visibleProjectIds])

  // ── 衍生：待辦事項清單 ──
  const pendingItems = useMemo(() => {
    if (!allWorkItems) return []
    let items = allWorkItems.filter((wi) =>
      wi.status === '待處理' || wi.status === '進行中' || wi.status === '擱置'
    )
    items = items.filter((wi) => !wi.project_id || visibleProjectIds.has(wi.project_id))
    if (filterProjectId) items = items.filter((wi) => wi.project_id === filterProjectId)
    items.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 9
      const pb = PRIORITY_ORDER[b.priority] ?? 9
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

  // ── 唯讀判斷 ──
  const isReadOnly = teamMode && filterUserId && filterUserId !== user?.id

  // ── handlers：案件 ──
  const handleProjectClick = useCallback((pid) => {
    setFilterProjectId((prev) => (prev === pid ? null : pid))
  }, [])

  const handleCreateProject = useCallback(() => {
    setEditingProject(null)
    setProjectModalMode('create')
  }, [])

  const handleEditProject = useCallback((p) => {
    setEditingProject(p)
    setProjectModalMode('edit')
  }, [])

  const handleArchiveProject = useCallback(async (p) => {
    if (!window.confirm(`確定要隱藏「${p.name}」嗎？`)) return
    try {
      await archiveProject(p.id, true)
      setFilterProjectId((prev) => (prev === p.id ? null : prev))
      mutateProjects()
      toast.success(`「${p.name}」已隱藏`)
    } catch (err) { toast.error('隱藏失敗：' + err.message) }
  }, [mutateProjects])

  const handleProjectModalClose = useCallback(() => {
    setProjectModalMode(null)
    setEditingProject(null)
    mutateProjects()
  }, [mutateProjects])

  // ── handlers：boss 模式 ──
  const handleToggleTeamMode = useCallback(() => {
    setTeamMode((prev) => !prev)
    setFilterUserId('')
  }, [])

  // ── handlers：待辦完成 ──
  const handleCompleteItem = useCallback(async (wi, completionDate) => {
    if (isReadOnly) { toast.error('唯讀模式：不能修改他人資料'); return }
    try {
      let log = await getLogByDate(completionDate)
      if (!log) {
        log = await createLog({ log_date: completionDate, work_type: '內勤' })
        toast('已自動建立 ' + completionDate + ' 日誌', { icon: '📝' })
      }
      await updateWorkItem(wi.id, { ...wi, status: '已完成', log_id: log.id, project_id: wi.project_id || null })
      toast.success(`「${wi.name}」已完成`)
      mutateWorkItems()
    } catch (err) { toast.error('完成失敗：' + err.message) }
  }, [isReadOnly, mutateWorkItems])

  // ── handlers：WorkItemModal ──
  const openWiModal = useCallback((item) => {
    if (isReadOnly && item !== undefined) {
      // 編輯模式 + 唯讀 → 阻擋
      if (item !== null) { toast.error('唯讀模式：不能修改他人資料'); return }
      toast.error('唯讀模式：不能新增他人待辦'); return
    }
    setWiModalItem(item)
  }, [isReadOnly])

  const handleWiModalClose = useCallback(() => {
    setWiModalItem(undefined)
    mutateWorkItems()
  }, [mutateWorkItems])

  // ── handlers：VisibilityModal ──
  const handleVisibilityClose = useCallback(async () => {
    setShowVisibilityModal(false)
    await refreshProfile()
    mutateProjects()
  }, [refreshProfile, mutateProjects])

  // ── 提供給外部的 mutate（讓 WorkDashboard 在日誌變更後也能 refresh workItems） ──
  const refreshWorkData = useCallback(() => {
    mutateWorkItems()
    mutateProjects()
  }, [mutateWorkItems, mutateProjects])

  const value = {
    // 資料
    projects: projects || [],
    allWorkItems,
    pendingItems,
    overdueCount,
    projectItemCounts,
    visibleProjectIds,
    // boss 模式
    teamMode,
    filterUserId,
    setFilterUserId,
    profilesList,
    userNameMap,
    canViewAll,
    isReadOnly,
    handleToggleTeamMode,
    // 篩選
    filterProjectId,
    setFilterProjectId,
    handleProjectClick,
    // 案件 Modal
    projectModalMode,
    editingProject,
    handleCreateProject,
    handleEditProject,
    handleArchiveProject,
    handleProjectModalClose,
    // 可見性 Modal
    showVisibilityModal,
    setShowVisibilityModal,
    handleVisibilityClose,
    // 待辦
    handleCompleteItem,
    // WorkItem Modal
    wiModalItem,
    openWiModal,
    handleWiModalClose,
    // 工具
    refreshWorkData,
    mutateWorkItems,
    // 常數（給子元件用）
    PROJECT_TYPE_ICON,
    TYPE_OPTIONS,
    TYPE_NEEDS_CLIENT,
    STATUS_OPTIONS,
    PRIORITY_OPTIONS,
  }

  return <WorkContext.Provider value={value}>{children}</WorkContext.Provider>
}

export function useWork() {
  const ctx = useContext(WorkContext)
  if (!ctx) throw new Error('useWork 必須在 WorkProvider 內使用')
  return ctx
}
