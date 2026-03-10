/**
 * 案件詳細頁 — 彈出視窗 (Modal)
 * 版本: v2.0
 * 日期: 2026-03-06
 * 檔案: src/components/ProjectDetail.jsx
 *
 * v2.0 重構：
 *  - projects 為大分類容器（移除 status/priority/client）
 *  - 客戶改為多對多（project_clients），多選勾選
 *  - 新增「工作項目」分頁，顯示此案件底下的 work_items
 *  - 分類連動邏輯保留（iroad/世曦攝影機/地動儀/日常工作 + 自訂）
 */

import { useState, useEffect, useRef } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { format, formatDistanceToNow } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { getClients } from '../api/clients'
import {
  getProjectClients, updateProjectClients,
  getProjectDevices, updateProjectDevices,
} from '../api/projects'
import { getWorkItemsByProject } from '../api/workItems'
import { uploadFile, deleteFile, parseAttachments, stringifyAttachments } from '../api/storage'

/* ========== 常數 ========== */

const TYPE_OPTIONS = ['iroad', '世曦攝影機', '地動儀', '日常工作']

const PRIORITY_STYLE = {
  '高': 'bg-red-100 text-red-700',
  '中': 'bg-amber-100 text-amber-700',
  '低': 'bg-gray-100 text-gray-500',
}

const STATUS_STYLE = {
  '待處理': 'bg-gray-100 text-gray-600',
  '進行中': 'bg-blue-100 text-blue-700',
  '已完成': 'bg-green-100 text-green-700',
  '擱置':   'bg-amber-100 text-amber-700',
}

/* ========== 主元件 ========== */

export default function ProjectDetail({ project, onClose, onSave, onDelete }) {
  const [activeTab, setActiveTab] = useState('info')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* 頂部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-gray-800">{project.name}</h3>
            {project.type && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">{project.type}</span>
            )}
          </div>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg transition-colors"
          >✕</button>
        </div>

        {/* 分頁標籤 */}
        <div className="flex px-6 pt-2 border-b border-gray-100 gap-1">
          <button onClick={() => setActiveTab('info')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'info'
                ? 'bg-white text-blue-600 border border-b-white border-gray-200 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >案件資訊</button>
          <button onClick={() => setActiveTab('workItems')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'workItems'
                ? 'bg-white text-blue-600 border border-b-white border-gray-200 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >工作項目</button>
        </div>

        {/* 分頁內容 */}
        <div className="flex-1 overflow-auto">
          {activeTab === 'info' ? (
            <ProjectInfoTab project={project} onSave={onSave} onDelete={onDelete} />
          ) : (
            <WorkItemsTab projectId={project.id} />
          )}
        </div>
      </div>
    </div>
  )
}

/* ========== 案件資訊 Tab ========== */

function ProjectInfoTab({ project, onSave, onDelete }) {
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [selectedClientIds, setSelectedClientIds] = useState([])
  const [selectedDeviceCodes, setSelectedDeviceCodes] = useState([])
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
  const [showLocations, setShowLocations] = useState(false)
  const [customType, setCustomType] = useState('')

  const { data: clients } = useSWR('clients', getClients)

  useEffect(() => {
    if (project) {
      setForm({ ...project })
      setAttachments(parseAttachments(project.attachment_url))
      setCustomType('')
      if (project.locations && project.locations.length > 0) setShowLocations(true)
      loadLinkedData(project.id)
    }
  }, [project])

  async function loadLinkedData(projectId) {
    try {
      const linkedClients = await getProjectClients(projectId)
      setSelectedClientIds(linkedClients.map((c) => c.id))
    } catch { setSelectedClientIds([]) }

    try {
      const linkedDevices = await getProjectDevices(projectId)
      setSelectedDeviceCodes(linkedDevices.map((d) => d.device_code))
    } catch { setSelectedDeviceCodes([]) }
  }

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleTypeChange(newType) {
    setForm((prev) => ({ ...prev, type: newType }))
    setSelectedDeviceCodes([])
    setCustomType('')
    // 世曦攝影機自動帶入世曦客戶
    if (newType === '世曦攝影機' && clients) {
      const shihHsi = clients.find((c) => c.name === '世曦')
      if (shihHsi) setSelectedClientIds([shihHsi.id])
    } else if (newType === '日常工作') {
      setSelectedClientIds([])
    }
  }

  function toggleClient(clientId) {
    setSelectedClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
    )
    setSelectedDeviceCodes([])
  }

  function toggleDevice(code) {
    setSelectedDeviceCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    )
  }

  async function handleFileUpload(files) {
    if (!files || files.length === 0) return
    setUploading(true)
    const newList = [...attachments]
    for (const file of files) {
      try {
        const result = await uploadFile(file, project.id)
        newList.push({ url: result.url, name: result.originalName })
        toast.success(`${file.name} 上傳成功`)
      } catch { toast.error(`${file.name} 上傳失敗`) }
    }
    setAttachments(newList)
    setUploading(false)
  }

  async function handleFileDelete(item) {
    if (!window.confirm(`確定要刪除「${item.name}」嗎？`)) return
    try {
      await deleteFile(item.url)
      setAttachments((prev) => prev.filter((a) => a.url !== item.url))
      toast.success('附件已刪除')
    } catch { toast.error('刪除失敗') }
  }

  async function handleSave() {
    if (!form.name?.trim()) { toast.error('案件名稱不可為空'); return }
    setSaving(true)
    try {
      const updates = {
        name: form.name,
        type: customType.trim() || form.type || null,
        notes: form.notes || null,
        locations: form.locations || [],
        attachment_url: stringifyAttachments(attachments),
      }
      await onSave(project.id, updates)
      await updateProjectClients(project.id, selectedClientIds)
      if (form.type === 'iroad') {
        await updateProjectDevices(project.id, selectedDeviceCodes)
      }
      toast.success('案件已更新')
    } catch (err) { toast.error('儲存失敗：' + err.message) }
    setSaving(false)
  }

  function handleDelete() {
    if (!window.confirm(`確定要刪除「${project.name}」嗎？此操作無法復原。`)) return
    onDelete(project.id)
  }

  // 判斷是否顯示客戶選擇、設備選擇
  const currentType = customType.trim() || form.type
  const showClientSelect = currentType !== '日常工作'
  const isAutoClient = currentType === '世曦攝影機'

  // 設備：iroad 類型時，根據已選客戶取設備
  const selectedClients = (clients || []).filter((c) => selectedClientIds.includes(c.id))
  const allDeviceCodes = selectedClients.flatMap((c) => c.device_codes || [])
  const showDevices = currentType === 'iroad' && allDeviceCodes.length > 0

  const createdAt = project.created_at
    ? format(new Date(project.created_at), 'yyyy/MM/dd HH:mm', { locale: zhTW }) : '—'
  const updatedAt = project.updated_at
    ? format(new Date(project.updated_at), 'yyyy/MM/dd HH:mm', { locale: zhTW }) : '—'

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4 text-xs text-gray-400">
        <span>建立：{createdAt}</span><span>·</span><span>更新：{updatedAt}</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* 案件名稱 */}
        <div className="col-span-2">
          <FieldBlock label="案件名稱" required>
            <input type="text" value={form.name || ''}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FieldBlock>
        </div>

        {/* 案件分類 */}
        <div>
          <FieldBlock label="案件分類">
            <select value={TYPE_OPTIONS.includes(form.type) ? form.type : '__custom__'}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setCustomType(form.type && !TYPE_OPTIONS.includes(form.type) ? form.type : '')
                  handleChange('type', '')
                } else {
                  handleTypeChange(e.target.value)
                }
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">未分類</option>
              {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value="__custom__">自訂分類...</option>
            </select>
          </FieldBlock>
        </div>

        {/* 自訂分類輸入 */}
        {(customType !== '' || (!TYPE_OPTIONS.includes(form.type) && form.type)) && (
          <div>
            <FieldBlock label="自訂分類名稱">
              <input type="text"
                value={customType || (TYPE_OPTIONS.includes(form.type) ? '' : form.type) || ''}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="輸入自訂分類"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </FieldBlock>
          </div>
        )}

        {/* 客戶多選 */}
        {showClientSelect && (
          <div className="col-span-2">
            <FieldBlock label={`關聯客戶${isAutoClient ? '（世曦攝影機自動帶入）' : ''}`}>
              <div className="border border-gray-200 rounded-lg p-3 max-h-40 overflow-auto">
                <div className="grid grid-cols-3 gap-2">
                  {(clients || []).map((c) => (
                    <label key={c.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-sm transition-colors ${
                      selectedClientIds.includes(c.id) ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-600'
                    }`}>
                      <input type="checkbox"
                        checked={selectedClientIds.includes(c.id)}
                        onChange={() => toggleClient(c.id)}
                        disabled={isAutoClient}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              {selectedClientIds.length > 0 && (
                <p className="text-xs text-blue-600 mt-1">
                  已選 {selectedClientIds.length} 個客戶：{selectedClients.map((c) => c.name).join('、')}
                </p>
              )}
            </FieldBlock>
          </div>
        )}

        {/* 設備勾選（iroad） */}
        {showDevices && (
          <div className="col-span-2">
            <FieldBlock label={`設備編號（共 ${allDeviceCodes.length} 台）`}>
              <div className="border border-gray-200 rounded-lg p-3 max-h-40 overflow-auto">
                <div className="grid grid-cols-3 gap-2">
                  {allDeviceCodes.map((code) => (
                    <label key={code} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-sm transition-colors ${
                      selectedDeviceCodes.includes(code) ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-600'
                    }`}>
                      <input type="checkbox"
                        checked={selectedDeviceCodes.includes(code)}
                        onChange={() => toggleDevice(code)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-mono text-xs">{code}</span>
                    </label>
                  ))}
                </div>
              </div>
              {selectedDeviceCodes.length > 0 && (
                <p className="text-xs text-blue-600 mt-1">已選 {selectedDeviceCodes.length} 台</p>
              )}
            </FieldBlock>
          </div>
        )}

        {/* 備註 */}
        <div className="col-span-2">
          <FieldBlock label="備註">
            <textarea value={form.notes || ''} rows={3}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="案件說明..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </FieldBlock>
        </div>

        {/* 附件 */}
        <div className="col-span-2">
          <FieldBlock label="附件">
            <FileUploader attachments={attachments} uploading={uploading}
              onUpload={handleFileUpload} onDelete={handleFileDelete} />
          </FieldBlock>
        </div>

        {/* 外勤地點（收合） */}
        <div className="col-span-2">
          <button type="button"
            onClick={() => setShowLocations(!showLocations)}
            className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            <span className={`transition-transform ${showLocations ? 'rotate-90' : ''}`}>▶</span>
            外勤地點
            {(form.locations || []).length > 0 && (
              <span className="text-xs text-gray-400 ml-1">（{(form.locations || []).join('、')}）</span>
            )}
          </button>
          {showLocations && (
            <div className="mt-2">
              <input type="text"
                value={(form.locations || []).join('、')}
                onChange={(e) => {
                  const locs = e.target.value.split(/[,、]/).map((s) => s.trim()).filter(Boolean)
                  handleChange('locations', locs)
                }}
                placeholder="用頓號分隔"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* 底部按鈕 */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
        <button onClick={handleDelete} className="text-sm text-red-500 hover:text-red-700 transition-colors">刪除案件</button>
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >{saving ? '儲存中...' : '儲存'}</button>
      </div>
    </div>
  )
}

/* ========== 工作項目 Tab ========== */

function WorkItemsTab({ projectId }) {
  const { data: workItems, isLoading } = useSWR(
    projectId ? `project-work-items-${projectId}` : null,
    () => getWorkItemsByProject(projectId)
  )

  if (isLoading) return <div className="p-6 text-center text-gray-400 text-sm">載入中...</div>

  if (!workItems || workItems.length === 0) {
    return (
      <div className="p-12 text-center">
        <p className="text-gray-400 text-sm">尚無工作項目</p>
        <p className="text-gray-300 text-xs mt-1">從「工作看板」或「每日日誌」關聯此案件後會自動出現</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <p className="text-xs text-gray-400 mb-4">共 {workItems.length} 筆工作項目</p>
      <div className="space-y-2">
        {workItems.map((item) => {
          const timeAgo = item.updated_at
            ? formatDistanceToNow(new Date(item.updated_at), { locale: zhTW, addSuffix: true })
            : ''
          return (
            <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                {item.description && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">{item.description}</p>
                )}
                {item.daily_logs?.log_date && (
                  <p className="text-xs text-gray-300 mt-0.5">
                    日誌：{item.daily_logs.log_date}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[item.status] || STATUS_STYLE['待處理']}`}>
                  {item.status}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_STYLE[item.priority] || PRIORITY_STYLE['中']}`}>
                  {item.priority}
                </span>
                <span className="text-xs text-gray-300">{timeAgo}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ========== 檔案上傳元件 ========== */

function FileUploader({ attachments, uploading, onUpload, onDelete }) {
  const fileInputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  return (
    <div>
      {attachments.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {attachments.map((item, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
              <span className="text-sm">📎</span>
              <a href={item.url} target="_blank" rel="noopener noreferrer"
                className="flex-1 text-sm text-blue-600 hover:underline truncate"
              >{item.name || '附件'}</a>
              <button onClick={() => onDelete(item)}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
              >✕</button>
            </div>
          ))}
        </div>
      )}
      <div
        onDrop={(e) => { e.preventDefault(); setDragOver(false); onUpload(Array.from(e.dataTransfer.files)) }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }`}
      >
        {uploading
          ? <p className="text-sm text-blue-600">上傳中...</p>
          : <p className="text-xs text-gray-500">拖拉或點擊上傳附件</p>
        }
      </div>
      <input ref={fileInputRef} type="file" multiple
        onChange={(e) => { onUpload(Array.from(e.target.files)); e.target.value = '' }}
        className="hidden"
      />
    </div>
  )
}

/* ========== 共用欄位區塊 ========== */

function FieldBlock({ label, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  )
}
