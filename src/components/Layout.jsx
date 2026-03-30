/**
 * 主佈局元件
 * 版本: v3.0
 * 日期: 2026-03-27
 * 檔案: src/components/Layout.jsx
 *
 * v3.0：整合 WorkProvider，全域顯示 ProjectBar + PendingPanel + 相關 Modal
 *       ProjectBar / PendingPanel / ProjectCard / VisibilityModal / ProjectModal / WorkItemModal
 *       全部從 WorkDashboard 搬到此處
 * v2.1：加入 SyncStatus
 * v2.0：Sidebar + Outlet 結構
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { Outlet } from 'react-router-dom'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import Sidebar from './Sidebar'
import SyncStatus from './SyncStatus'
import { WorkProvider, useWork } from '../contexts/WorkContext'
import { getClients } from '../api/clients'
import {
  getAllowedProjects, updateHiddenProjects,
  createProject, updateProject, updateProjectClients,
} from '../api/projects'
import {
  createWorkItem, updateWorkItem, deleteWorkItem,
} from '../api/workItems'
import { getLogByDate, createLog } from '../api/dailyLogs'
import { useAuth } from '../contexts/AuthContext'

/* ================================================================
   外層：用 WorkProvider 包住內層
   ================================================================ */

export default function Layout() {
  return (
    <WorkProvider>
      <LayoutInner />
    </WorkProvider>
  )
}

/* ================================================================
   內層：Sidebar + ProjectBar + Outlet + PendingPanel + Modal
   ================================================================ */

function LayoutInner() {
  const work = useWork()

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#f0f2f5' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 上方：案件方塊列 */}
        <ProjectBar />

        {/* 中間：頁面內容 */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>

        {/* 下方：待辦事項面板 */}
        <PendingPanel />
      </div>
      <SyncStatus />

      {/* 全域 Modal */}
      {work.projectModalMode && (
        <ProjectModal
          mode={work.projectModalMode}
          project={work.editingProject}
          onClose={work.handleProjectModalClose}
        />
      )}
      {work.showVisibilityModal && <VisibilityModal />}
      {work.wiModalItem !== undefined && <WorkItemModal />}
    </div>
  )
}

/* ================================================================
   ProjectBar — 案件方塊列
   ================================================================ */

function ProjectBar() {
  const {
    projects, projectItemCounts, filterProjectId,
    handleProjectClick, handleCreateProject, handleEditProject,
    handleArchiveProject, setShowVisibilityModal,
  } = useWork()

  const [hovered, setHovered] = useState(false)
  const totalItems = Object.values(projectItemCounts).reduce((sum, n) => sum + n, 0)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="border-b border-gray-200 bg-white transition-all duration-200 ease-in-out flex-shrink-0"
      style={{ minHeight: hovered ? 120 : 48 }}
    >
      <div className="flex items-center justify-between px-5 h-12">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600">案件總覽</span>
          <span className="text-xs text-gray-400">（{projects.length} 案件，{totalItems} 工作項目）</span>
        </div>
        <div className="flex items-center gap-2">
          {filterProjectId && (
            <button onClick={() => handleProjectClick(filterProjectId)}
              className="text-xs text-blue-500 hover:text-blue-700 transition-colors">✕ 取消篩選</button>
          )}
          <button onClick={() => setShowVisibilityModal(true)}
            className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
            title="設定要顯示哪些案件"
          >👁 篩選</button>
          <button onClick={handleCreateProject}
            className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">＋ 新增案件</button>
        </div>
      </div>
      <div className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{ maxHeight: hovered ? 300 : 0, opacity: hovered ? 1 : 0 }}>
        <div className="flex gap-3 px-5 pb-4 overflow-x-auto">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} count={projectItemCounts[p.id] || 0}
              isActive={filterProjectId === p.id}
              onFilter={() => handleProjectClick(p.id)}
              onEdit={() => handleEditProject(p)}
              onArchive={() => handleArchiveProject(p)} />
          ))}
          {projects.length === 0 && <p className="text-xs text-gray-300 py-2">尚無案件，點右上角新增</p>}
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   ProjectCard — 單張案件卡片
   ================================================================ */

function ProjectCard({ project, count, isActive, onFilter, onEdit, onArchive }) {
  const { PROJECT_TYPE_ICON } = useWork()
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
   PendingPanel — 待完成事項面板
   ================================================================ */

const PRIORITY_BADGE = { '高': 'bg-red-100 text-red-600', '中': 'bg-amber-100 text-amber-600', '低': 'bg-gray-100 text-gray-500' }
const STATUS_BADGE = { '待處理': 'bg-gray-100 text-gray-600', '進行中': 'bg-blue-100 text-blue-600', '擱置': 'bg-amber-100 text-amber-600' }

function PendingPanel() {
  const {
    pendingItems, overdueCount, isReadOnly, teamMode, userNameMap,
    openWiModal, handleCompleteItem,
  } = useWork()

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
    handleCompleteItem(completingItem, completionDate)
    setCompletingItem(null)
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="border-t border-gray-200 bg-white transition-all duration-200 ease-in-out flex-shrink-0"
    >
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm">{hovered ? '▼' : '▶'}</span>
          <span className="text-sm font-medium text-gray-700">待完成事項</span>
          <span className="text-xs text-gray-400">
            {pendingItems.length} 項
            {overdueCount > 0 && <span className="text-red-500 ml-1">（逾期 {overdueCount} 項）</span>}
          </span>
        </div>
        {!isReadOnly && (
          <button onClick={() => openWiModal(null)}
            className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >＋ 新增待辦</button>
        )}
      </div>

      <div className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{ maxHeight: hovered ? 320 : 0, opacity: hovered ? 1 : 0 }}
      >
        <div className="max-h-64 overflow-auto px-5 pb-4">
          {pendingItems.length === 0 ? (
            <p className="text-xs text-gray-300 py-4 text-center">沒有待完成項目 🎉</p>
          ) : (
            <div className="space-y-1.5">
              {pendingItems.map((wi) => {
                const todayStr = format(new Date(), 'yyyy-MM-dd')
                const isOverdue = wi.due_date && wi.due_date < todayStr
                return (
                  <div key={wi.id} onClick={() => openWiModal(wi)}
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

      {/* 快速完成 popup */}
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
   VisibilityModal — 案件顯示/隱藏設定
   ================================================================ */

function VisibilityModal() {
  const { handleVisibilityClose, PROJECT_TYPE_ICON } = useWork()
  const { user, profile } = useAuth()

  const [allowedProjects, setAllowedProjects] = useState([])
  const [hiddenIds, setHiddenIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const allowed = await getAllowedProjects(user.id)
        setAllowedProjects(allowed)
        setHiddenIds(profile?.hidden_projects || [])
      } catch (err) {
        console.warn('[VisibilityModal] 載入失敗:', err.message)
        toast.error('載入失敗')
      }
      setLoading(false)
    }
    load()
  }, [user?.id, profile])

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
      const validHidden = hiddenIds.filter((id) => allowedProjects.some((p) => p.id === id))
      await updateHiddenProjects(user.id, validHidden)
      toast.success('案件顯示設定已儲存')
      handleVisibilityClose()
    } catch (err) {
      toast.error('儲存失敗：' + err.message)
    }
    setSaving(false)
  }

  const visibleCount = allowedProjects.length - hiddenIds.filter((id) => allowedProjects.some((p) => p.id === id)).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleVisibilityClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-800">案件顯示設定</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              勾選要顯示的案件（{visibleCount}/{allowedProjects.length}）
            </p>
          </div>
          <button onClick={handleVisibilityClose} className="text-gray-400 hover:text-gray-600 text-lg transition-colors">✕</button>
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
          <button onClick={handleVisibilityClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">取消</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >{saving ? '儲存中...' : '儲存'}</button>
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   ProjectModal — 新增/編輯案件
   ================================================================ */

function ProjectModal({ mode, project, onClose }) {
  const { PROJECT_TYPE_ICON, TYPE_OPTIONS, TYPE_NEEDS_CLIENT } = useWork()
  const isEdit = mode === 'edit'
  const [form, setForm] = useState({ name: '', type: '', notes: '', selectedClientIds: [] })
  const [saving, setSaving] = useState(false)
  const { data: clients } = useSWR('clients', getClients)

  useEffect(() => {
    if (isEdit && project) {
      setForm({
        name: project.name || '', type: project.type || '', notes: project.notes || '',
        selectedClientIds: (project.clients || []).map((c) => c.id),
      })
    }
  }, [isEdit, project])

  function handleChange(f, v) { setForm((prev) => ({ ...prev, [f]: v })) }

  function handleTypeChange(t) {
    const u = { type: t }
    if (t === '世曦攝影機') {
      const sx = (clients || []).find((c) => c.name === '世曦')
      u.selectedClientIds = sx ? [sx.id] : []
    } else if (t === '日常工作') {
      u.selectedClientIds = []
    } else if (t !== form.type) {
      u.selectedClientIds = []
    }
    setForm((prev) => ({ ...prev, ...u }))
  }

  function toggleClient(cid) {
    setForm((prev) => ({
      ...prev,
      selectedClientIds: prev.selectedClientIds.includes(cid)
        ? prev.selectedClientIds.filter((id) => id !== cid)
        : [...prev.selectedClientIds, cid],
    }))
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
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >{saving ? '儲存中...' : '儲存'}</button>
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   WorkItemModal — 新增/編輯待辦工作項目
   ================================================================ */

function WorkItemModal() {
  const {
    wiModalItem: item, handleWiModalClose: onClose,
    projects, STATUS_OPTIONS, PRIORITY_OPTIONS,
  } = useWork()

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
