/**
 * 工作看板 (Kanban Board)
 * 版本: v2.0
 * 日期: 2026-03-06
 * 檔案: src/pages/KanbanBoard.jsx
 *
 * v2.0 重構：
 *  - 看板卡片從 projects 改為 work_items
 *  - 新增「依案件篩選」下拉
 *  - 下方面板改為工作項目詳情編輯
 *  - 新增工作項目 Modal（可選案件歸屬）
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { format, formatDistanceToNow } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import {
  getWorkItems, createWorkItem, updateWorkItem,
  updateWorkItemStatus, deleteWorkItem,
} from '../api/workItems'
import { getProjects } from '../api/projects'
import { getClients } from '../api/clients'

/* ========== 常數定義 ========== */

const COLUMNS = [
  { id: '待處理', label: '待處理', dot: 'bg-gray-400' },
  { id: '進行中', label: '進行中', dot: 'bg-blue-500' },
  { id: '已完成', label: '已完成', dot: 'bg-green-500' },
  { id: '擱置',   label: '擱置',   dot: 'bg-amber-500' },
]

const PRIORITY_STYLE = {
  '高': 'bg-red-100 text-red-700',
  '中': 'bg-amber-100 text-amber-700',
  '低': 'bg-gray-100 text-gray-500',
}

const PRIORITY_OPTIONS = ['高', '中', '低']
const STATUS_OPTIONS = ['待處理', '進行中', '已完成', '擱置']

/* ========== 主元件 ========== */

export default function KanbanBoard() {
  const { data: workItemsList, error, isLoading, mutate } = useSWR('work-items', getWorkItems)
  const { data: projects } = useSWR('projects', getProjects)
  const { data: clients } = useSWR('clients', getClients)

  const [showModal, setShowModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [filterProjectId, setFilterProjectId] = useState('')
  const [splitRatio, setSplitRatio] = useState(0.5)
  const containerRef = useRef(null)
  const isDragging = useRef(false)

  /* === 拖拉分割線 === */
  const handleMouseDown = useCallback(() => { isDragging.current = true }, [])

  useEffect(() => {
    function handleMouseMove(e) {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const ratio = (e.clientY - rect.top) / rect.height
      setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)))
    }
    function handleMouseUp() { isDragging.current = false }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  /* === 篩選 === */
  const filteredItems = (workItemsList || []).filter((item) => {
    if (!filterProjectId) return true
    if (filterProjectId === '__none__') return !item.project_id
    return item.project_id === filterProjectId
  })

  /* === 拖拉卡片換狀態 === */
  async function handleDragEnd(result) {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId) return

    const newStatus = destination.droppableId
    // 樂觀更新
    const updated = (workItemsList || []).map((item) =>
      item.id === draggableId ? { ...item, status: newStatus } : item
    )
    mutate(updated, false)

    try {
      await updateWorkItemStatus(draggableId, newStatus)
      toast.success(`狀態更新為「${newStatus}」`)
      if (selectedItem?.id === draggableId) {
        setSelectedItem((prev) => ({ ...prev, status: newStatus }))
      }
    } catch {
      mutate()
      toast.error('狀態更新失敗')
    }
  }

  /* === CRUD === */
  async function handleCreate(formData) {
    try {
      await createWorkItem(formData)
      mutate()
      setShowModal(false)
      toast.success('工作項目已建立')
    } catch (err) {
      toast.error('建立失敗：' + err.message)
    }
  }

  async function handleUpdate(id, updates) {
    try {
      const result = await updateWorkItem(id, updates)
      mutate()
      setSelectedItem(result)
      toast.success('已更新')
    } catch (err) {
      toast.error('更新失敗：' + err.message)
    }
  }

  async function handleDelete(id) {
    try {
      await deleteWorkItem(id)
      mutate()
      setSelectedItem(null)
      toast.success('已刪除')
    } catch (err) {
      toast.error('刪除失敗：' + err.message)
    }
  }

  function handleCardClick(item) {
    setSelectedItem(item)
  }

  /* --- 載入 / 錯誤狀態 --- */
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

  /* --- 將工作項目依狀態分組 --- */
  const grouped = {}
  COLUMNS.forEach((col) => { grouped[col.id] = [] })
  filteredItems.forEach((item) => {
    if (grouped[item.status]) grouped[item.status].push(item)
    else grouped['待處理'].push(item)
  })

  /* --- 渲染 --- */
  const topHeight = selectedItem ? `${splitRatio * 100}%` : '100%'
  const bottomHeight = selectedItem ? `${(1 - splitRatio) * 100}%` : '0%'

  return (
    <div ref={containerRef} className="h-full flex flex-col overflow-hidden">
      {/* ===== 上半：看板 ===== */}
      <div style={{ height: topHeight }} className="flex flex-col min-h-0 transition-none">
        {/* 標題列 */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3">
          <div>
            <h2 className="text-xl font-bold text-gray-800">工作看板</h2>
            <p className="text-gray-400 text-sm mt-1">
              共 {filteredItems.length} 筆工作項目
              {filterProjectId && projects
                ? `（${(projects || []).find((p) => p.id === filterProjectId)?.name || ''}）`
                : ''
              }
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* 案件篩選 */}
            <select
              value={filterProjectId}
              onChange={(e) => setFilterProjectId(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">全部案件</option>
              <option value="__none__">未歸屬案件</option>
              {(projects || []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >＋ 新增工作</button>
          </div>
        </div>

        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex-1 flex gap-4 overflow-x-auto overflow-y-auto px-6 pb-2">
            {COLUMNS.map((col) => (
              <KanbanColumn key={col.id} column={col} items={grouped[col.id]}
                onCardClick={handleCardClick} selectedId={selectedItem?.id}
              />
            ))}
          </div>
        </DragDropContext>
      </div>

      {/* ===== 拖拉分割線 ===== */}
      {selectedItem && (
        <div
          onMouseDown={handleMouseDown}
          className="h-2 bg-gray-200 hover:bg-blue-300 cursor-row-resize flex-shrink-0 flex items-center justify-center transition-colors"
        >
          <div className="w-12 h-1 bg-gray-400 rounded-full" />
        </div>
      )}

      {/* ===== 下半：詳細面板 ===== */}
      {selectedItem ? (
        <div style={{ height: bottomHeight }} className="flex flex-col min-h-0 border-t border-gray-200">
          <DetailPanel
            item={selectedItem}
            projects={projects || []}
            onSave={handleUpdate}
            onDelete={handleDelete}
            onClose={() => setSelectedItem(null)}
          />
        </div>
      ) : (
        <div className="hidden" />
      )}

      {/* 新增工作項目 Modal */}
      {showModal && (
        <CreateWorkItemModal
          projects={projects || []}
          onClose={() => setShowModal(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  )
}

/* ========== 下方詳細面板 ========== */

function DetailPanel({ item, projects, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (item) setForm({ ...item })
  }, [item])

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.name?.trim()) { toast.error('工作名稱不可為空'); return }
    setSaving(true)
    try {
      const updates = {
        name: form.name,
        description: form.description || null,
        status: form.status,
        priority: form.priority,
        due_date: form.due_date || null,
        project_id: form.project_id || null,
      }
      await onSave(item.id, updates)
    } catch (err) { toast.error('儲存失敗：' + err.message) }
    setSaving(false)
  }

  function handleDelete() {
    if (!window.confirm(`確定要刪除「${item.name}」嗎？`)) return
    onDelete(item.id)
  }

  const createdAt = item.created_at
    ? format(new Date(item.created_at), 'yyyy/MM/dd HH:mm', { locale: zhTW }) : '—'
  const updatedAt = item.updated_at
    ? format(new Date(item.updated_at), 'yyyy/MM/dd HH:mm', { locale: zhTW }) : '—'

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 標題列 */}
      <div className="flex items-center justify-between px-6 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-sm font-medium text-gray-700 truncate">{item.name}</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">建立 {createdAt} · 更新 {updatedAt}</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg transition-colors">✕</button>
        </div>
      </div>

      {/* 編輯區 */}
      <div className="flex-1 overflow-auto bg-white p-6">
        <div className="grid grid-cols-3 gap-4">
          {/* 工作名稱 */}
          <div className="col-span-2">
            <FieldLabel label="工作名稱" required />
            <input type="text" value={form.name || ''}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 優先級 */}
          <div>
            <FieldLabel label="優先級" />
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((p) => (
                <button key={p} type="button" onClick={() => handleChange('priority', p)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
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

          {/* 狀態 + 所屬案件 */}
          <div>
            <FieldLabel label="狀態" />
            <select value={form.status || '待處理'} onChange={(e) => handleChange('status', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >{STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </div>

          <div>
            <FieldLabel label="所屬案件" />
            <select value={form.project_id || ''} onChange={(e) => handleChange('project_id', e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">無（獨立項目）</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <FieldLabel label="截止日期" />
            <input type="date" value={form.due_date || ''}
              onChange={(e) => handleChange('due_date', e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 詳細說明 */}
          <div className="col-span-3">
            <FieldLabel label="詳細說明" />
            <textarea value={form.description || ''} rows={3}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="工作內容補充..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        {/* 底部按鈕 */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <button onClick={handleDelete} className="text-sm text-red-500 hover:text-red-700 transition-colors">刪除</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >{saving ? '儲存中...' : '儲存'}</button>
        </div>
      </div>
    </div>
  )
}

/* ========== 看板欄位 ========== */

function KanbanColumn({ column, items, onCardClick, selectedId }) {
  return (
    <div className="flex-1 min-w-56 flex flex-col">
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className={`w-2.5 h-2.5 rounded-full ${column.dot}`} />
        <h3 className="text-sm font-semibold text-gray-700">{column.label}</h3>
        <span className="text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">{items.length}</span>
      </div>

      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div ref={provided.innerRef} {...provided.droppableProps}
            className={`flex-1 rounded-xl p-2 space-y-2 transition-colors overflow-auto ${
              snapshot.isDraggingOver ? 'bg-blue-50' : 'bg-gray-100/50'
            }`}
            style={{ minHeight: '80px' }}
          >
            {items.map((item, index) => (
              <WorkItemCard key={item.id} item={item} index={index}
                isSelected={item.id === selectedId}
                onClick={() => onCardClick(item)}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}

/* ========== 工作項目卡片 ========== */

function WorkItemCard({ item, index, isSelected, onClick }) {
  const timeAgo = item.updated_at
    ? formatDistanceToNow(new Date(item.updated_at), { locale: zhTW, addSuffix: true })
    : ''

  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
          onClick={onClick}
          className={`bg-white rounded-lg p-3 shadow-sm border cursor-grab transition-all ${
            snapshot.isDragging
              ? 'shadow-lg rotate-2 scale-105 border-gray-100'
              : isSelected
                ? 'border-blue-400 ring-2 ring-blue-100 shadow-md'
                : 'border-gray-100 hover:shadow-md hover:-translate-y-0.5'
          }`}
        >
          <p className="text-sm font-medium text-gray-800 mb-2 leading-snug">{item.name}</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLE[item.priority] || PRIORITY_STYLE['中']}`}>
              {item.priority}
            </span>
            {item.projects?.name && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">{item.projects.name}</span>
            )}
            {item.projects?.type && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{item.projects.type}</span>
            )}
            {item.due_date && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-600">
                {format(new Date(item.due_date + 'T00:00:00'), 'M/d')}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">{timeAgo}</p>
        </div>
      )}
    </Draggable>
  )
}

/* ========== 新增工作項目 Modal ========== */

function CreateWorkItemModal({ projects, onClose, onCreate }) {
  const [form, setForm] = useState({
    name: '', description: '', status: '待處理', priority: '中',
    project_id: '', due_date: '',
  })
  const [submitting, setSubmitting] = useState(false)

  function handleChange(field, value) { setForm((prev) => ({ ...prev, [field]: value })) }

  async function handleSubmit() {
    if (!form.name.trim()) { toast.error('請輸入工作名稱'); return }
    setSubmitting(true)
    await onCreate({
      ...form,
      project_id: form.project_id || null,
      due_date: form.due_date || null,
    })
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[85vh] overflow-auto">
        <h3 className="text-lg font-bold text-gray-800 mb-4">新增工作項目</h3>
        <div className="space-y-4">
          {/* 名稱 */}
          <div>
            <FieldLabel label="工作名稱" required />
            <input type="text" value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="例：更換世曦 A 路段攝影機"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 所屬案件 */}
          <div>
            <FieldLabel label="所屬案件" />
            <select value={form.project_id} onChange={(e) => handleChange('project_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">無（獨立項目）</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* 狀態 + 優先級 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <FieldLabel label="狀態" />
              <select value={form.status} onChange={(e) => handleChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >{STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </div>
            <div className="flex-1">
              <FieldLabel label="優先級" />
              <select value={form.priority} onChange={(e) => handleChange('priority', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >{PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}</select>
            </div>
          </div>

          {/* 截止日 */}
          <div>
            <FieldLabel label="截止日期" />
            <input type="date" value={form.due_date}
              onChange={(e) => handleChange('due_date', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 說明 */}
          <div>
            <FieldLabel label="詳細說明" />
            <textarea value={form.description} rows={3} onChange={(e) => handleChange('description', e.target.value)}
              placeholder="補充說明..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">取消</button>
          <button onClick={handleSubmit} disabled={submitting}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >{submitting ? '建立中...' : '建立'}</button>
        </div>
      </div>
    </div>
  )
}

/* ========== 共用元件 ========== */

function FieldLabel({ label, required }) {
  return (
    <label className="block text-sm font-medium text-gray-600 mb-1">
      {label}{required && <span className="text-red-500"> *</span>}
    </label>
  )
}
