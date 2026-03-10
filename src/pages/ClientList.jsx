/**
 * 客戶管理頁面
 * 版本: v1.3
 * 日期: 2025-03-04
 * 檔案: src/pages/ClientList.jsx
 *
 * v1.3 修改：
 *  - 匯入策略改為：客戶名稱匹配，有就更新、沒有就新增
 *  - 預覽 Modal 顯示新增/更新筆數
 */

import { useState, useMemo, useRef } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { getClients, createClient, updateClient, deleteClient } from '../api/clients'
import { getDevices } from '../api/devices'
import { exportToFile, parseImportFile, mapImportData } from '../utils/importExport'

/* ========== 常數 ========== */

const CATEGORY_COLORS = {
  '新海': 'bg-blue-100 text-blue-700',
  '台水': 'bg-cyan-100 text-cyan-700',
  '欣芝': 'bg-green-100 text-green-700',
  '欣桃': 'bg-emerald-100 text-emerald-700',
  '欣泰': 'bg-teal-100 text-teal-700',
  '欣湖': 'bg-sky-100 text-sky-700',
  '欣隆': 'bg-indigo-100 text-indigo-700',
  '中油': 'bg-amber-100 text-amber-700',
  '台電': 'bg-yellow-100 text-yellow-700',
  '水利局': 'bg-violet-100 text-violet-700',
  '交通局': 'bg-purple-100 text-purple-700',
}

const EMPTY_FORM = {
  name: '',
  category: '',
  contact_name: '',
  phone: '',
  email: '',
  contact_notes: '',
  payment_date: '',
  payment_notes: '',
  notes: '',
}

const CLIENT_COLUMNS = [
  { header: '名稱',     key: 'name' },
  { header: '業務分類', key: 'category' },
  { header: '聯絡人',   key: 'contact_name' },
  { header: '電話',     key: 'phone' },
  { header: 'Email',    key: 'email' },
  { header: '聯絡備註', key: 'contact_notes' },
  { header: '付款日期', key: 'payment_date' },
  { header: '付款備註', key: 'payment_notes' },
  { header: '備註',     key: 'notes' },
]

/* ========== 主元件 ========== */

export default function ClientList() {
  const { data: clients, error, isLoading, mutate } = useSWR('clients', getClients)
  const { data: allDevices } = useSWR('devices', getDevices)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingClient, setEditingClient] = useState(null)
  const [importData, setImportData] = useState(null)
  const [showExportMenu, setShowExportMenu] = useState(false)

  const clientDeviceCount = useMemo(() => {
    const map = {}
    if (!allDevices) return map
    for (const d of allDevices) {
      if (d.client_id) map[d.client_id] = (map[d.client_id] || 0) + 1
    }
    return map
  }, [allDevices])

  const categories = useMemo(() => {
    if (!clients) return []
    const set = new Set(clients.map((c) => c.category).filter(Boolean))
    return [...set].sort()
  }, [clients])

  const filtered = useMemo(() => {
    if (!clients) return []
    return clients.filter((c) => {
      const matchCategory = !filterCategory || c.category === filterCategory
      const keyword = search.trim().toLowerCase()
      if (!keyword) return matchCategory
      const matchSearch =
        (c.name || '').toLowerCase().includes(keyword) ||
        (c.contact_name || '').toLowerCase().includes(keyword) ||
        (c.phone || '').toLowerCase().includes(keyword) ||
        (c.email || '').toLowerCase().includes(keyword) ||
        (c.category || '').toLowerCase().includes(keyword)
      return matchCategory && matchSearch
    })
  }, [clients, search, filterCategory])

  async function handleCreate(formData) {
    try {
      await createClient(formData)
      mutate()
      setShowCreateModal(false)
      toast.success('客戶已建立')
    } catch (err) {
      toast.error('建立失敗：' + err.message)
    }
  }

  async function handleUpdate(id, formData) {
    try {
      await updateClient(id, formData)
      mutate()
      setEditingClient(null)
      toast.success('客戶已更新')
    } catch (err) {
      toast.error('更新失敗：' + err.message)
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`確定要刪除「${name}」嗎？此操作無法復原。`)) return
    try {
      await deleteClient(id)
      mutate()
      setEditingClient(null)
      toast.success('客戶已刪除')
    } catch (err) {
      toast.error('刪除失敗：' + err.message)
    }
  }

  function handleExport(format) {
    setShowExportMenu(false)
    if (!clients || clients.length === 0) {
      toast.error('沒有資料可匯出')
      return
    }
    exportToFile(clients, CLIENT_COLUMNS, '客戶資料', format)
    toast.success(`已匯出 ${clients.length} 筆客戶（${format.toUpperCase()}）`)
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const raw = await parseImportFile(file)
      const mapped = mapImportData(raw, CLIENT_COLUMNS)
      const valid = mapped.filter((r) => r.name)
      if (valid.length === 0) {
        toast.error('檔案中沒有有效資料（缺少「名稱」欄位）')
        return
      }

      // 比對現有客戶，標記新增/更新
      const existingMap = {}
      for (const c of (clients || [])) {
        existingMap[c.name] = c.id
      }

      let newCount = 0
      let updateCount = 0
      for (const row of valid) {
        if (existingMap[row.name]) {
          updateCount++
        } else {
          newCount++
        }
      }

      setImportData({
        rows: valid,
        rawPreview: raw.slice(0, 5),
        total: valid.length,
        newCount,
        updateCount,
        existingMap,
      })
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleImportConfirm() {
    if (!importData) return
    const { rows, existingMap } = importData
    let created = 0, updated = 0, fail = 0

    for (const row of rows) {
      try {
        const existingId = existingMap[row.name]
        if (existingId) {
          await updateClient(existingId, row)
          updated++
        } else {
          await createClient(row)
          created++
        }
      } catch {
        fail++
      }
    }

    mutate()
    setImportData(null)

    const parts = []
    if (created > 0) parts.push(`新增 ${created} 筆`)
    if (updated > 0) parts.push(`更新 ${updated} 筆`)
    if (fail > 0) parts.push(`失敗 ${fail} 筆`)

    if (fail === 0) toast.success(`匯入完成：${parts.join('、')}`)
    else toast.error(`匯入完成：${parts.join('、')}`)
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

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-800">客戶管理</h2>
          <p className="text-gray-400 text-sm mt-1">
            共 {(clients || []).length} 位客戶
            {filtered.length !== (clients || []).length && `，顯示 ${filtered.length} 筆`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportButton onFileSelect={handleImportFile} />
          <div className="relative">
            <button onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >📤 匯出</button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 w-32">
                  <button onClick={() => handleExport('xlsx')} className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">XLSX（Excel）</button>
                  <button onClick={() => handleExport('csv')} className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">CSV</button>
                </div>
              </>
            )}
          </div>
          <button onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >＋ 新增客戶</button>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋客戶名稱、聯絡人、電話..."
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">全部業務分類</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-gray-400 text-sm py-8 text-center">
            {search || filterCategory ? '沒有符合的客戶' : '尚無客戶資料'}
          </p>
        ) : (
          filtered.map((client) => (
            <ClientRow key={client.id} client={client}
              deviceCount={clientDeviceCount[client.id] || 0}
              isActive={editingClient?.id === client.id}
              onClick={() => setEditingClient(client)}
            />
          ))
        )}
      </div>

      {showCreateModal && (
        <ClientFormModal title="新增客戶" initialData={EMPTY_FORM}
          onClose={() => setShowCreateModal(false)}
          onSave={(data) => handleCreate(data)} submitLabel="建立客戶"
        />
      )}

      {editingClient && (
        <ClientFormModal title="編輯客戶" initialData={editingClient}
          clientDevices={(allDevices || []).filter((d) => d.client_id === editingClient.id)}
          onClose={() => setEditingClient(null)}
          onSave={(data) => handleUpdate(editingClient.id, data)}
          onDelete={() => handleDelete(editingClient.id, editingClient.name)}
          submitLabel="儲存"
        />
      )}

      {importData && (
        <ImportPreviewModal data={importData} columns={CLIENT_COLUMNS}
          onConfirm={handleImportConfirm} onCancel={() => setImportData(null)}
        />
      )}
    </div>
  )
}

/* ========== 客戶列表行 ========== */

function ClientRow({ client, deviceCount, isActive, onClick }) {
  const catStyle = CATEGORY_COLORS[client.category] || 'bg-gray-100 text-gray-600'
  return (
    <div onClick={onClick}
      className={`flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer transition-all ${
        isActive ? 'bg-blue-50 border border-blue-200' : 'bg-white border border-gray-100 hover:bg-gray-50 hover:shadow-sm'
      }`}
    >
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${catStyle}`}>
        {client.category || '未分類'}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{client.name}</p>
        {client.contact_name && <p className="text-xs text-gray-400 truncate">{client.contact_name}</p>}
      </div>
      <div className="hidden sm:block text-xs text-gray-400 truncate max-w-40">{client.phone || '—'}</div>
      {deviceCount > 0 && <span className="text-xs text-gray-400 whitespace-nowrap">📷 {deviceCount}</span>}
      {client.payment_date && (
        <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full whitespace-nowrap">{client.payment_date}</span>
      )}
    </div>
  )
}

/* ========== 客戶表單 Modal（新增/編輯共用） ========== */

function ClientFormModal({ title, initialData, clientDevices, onClose, onSave, onDelete, submitLabel }) {
  const [form, setForm] = useState({ ...initialData })
  const [saving, setSaving] = useState(false)
  const isEdit = !!onDelete

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.name?.trim()) { toast.error('客戶名稱不可為空'); return }
    setSaving(true)
    const { id, created_at, updated_at, device_codes, device_count, ...updates } = form
    await onSave(updates)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <FieldBlock label="客戶名稱" required>
                <input type="text" value={form.name || ''} onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="例：金華泰瓦斯工程有限公司"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </FieldBlock>
            </div>
            <FieldBlock label="業務分類">
              <input type="text" value={form.category || ''} onChange={(e) => handleChange('category', e.target.value)}
                placeholder="例：台水"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </FieldBlock>
            <FieldBlock label="聯絡人">
              <input type="text" value={form.contact_name || ''} onChange={(e) => handleChange('contact_name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </FieldBlock>
            <FieldBlock label="電話">
              <input type="text" value={form.phone || ''} onChange={(e) => handleChange('phone', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </FieldBlock>
            <FieldBlock label="Email">
              <input type="text" value={form.email || ''} onChange={(e) => handleChange('email', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </FieldBlock>
            <div className="col-span-2">
              <FieldBlock label="聯絡備註">
                <textarea value={form.contact_notes || ''} rows={2} onChange={(e) => handleChange('contact_notes', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </FieldBlock>
            </div>
            <FieldBlock label="付款日期">
              <input type="text" value={form.payment_date || ''} onChange={(e) => handleChange('payment_date', e.target.value)}
                placeholder="例：2/10"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </FieldBlock>
            <FieldBlock label="付款備註">
              <input type="text" value={form.payment_notes || ''} onChange={(e) => handleChange('payment_notes', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </FieldBlock>
            <div className="col-span-2">
              <FieldBlock label="備註">
                <textarea value={form.notes || ''} rows={2} onChange={(e) => handleChange('notes', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </FieldBlock>
            </div>

            {isEdit && clientDevices && (
              <div className="col-span-2 pt-2 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-600 mb-2">設備（{clientDevices.length} 台）</p>
                {clientDevices.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3 text-center bg-gray-50 rounded-lg">尚無設備，請至「設備管理」新增</p>
                ) : (
                  <div className="space-y-1 max-h-32 overflow-auto">
                    {clientDevices.map((dev) => (
                      <div key={dev.id} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg text-xs">
                        <span className="font-mono text-gray-500">{dev.device_code || '—'}</span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-600">{dev.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          {isEdit ? (
            <button onClick={onDelete} className="text-sm text-red-500 hover:text-red-700 transition-colors">刪除客戶</button>
          ) : <div />}
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">取消</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >{saving ? '處理中...' : submitLabel}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ========== 匯入按鈕 ========== */

function ImportButton({ onFileSelect }) {
  const ref = useRef(null)
  return (
    <>
      <button onClick={() => ref.current?.click()}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
      >📥 匯入</button>
      <input ref={ref} type="file" accept=".csv,.xlsx,.xls" onChange={onFileSelect} className="hidden" />
    </>
  )
}

/* ========== 匯入預覽 Modal ========== */

function ImportPreviewModal({ data, columns, onConfirm, onCancel }) {
  const [importing, setImporting] = useState(false)

  async function handleConfirm() {
    setImporting(true)
    await onConfirm()
    setImporting(false)
  }

  const headers = columns.map((c) => c.header)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6 max-h-[80vh] flex flex-col">
        <h3 className="text-lg font-bold text-gray-800 mb-2">匯入預覽</h3>
        <p className="text-sm text-gray-500 mb-1">
          共解析到 <span className="font-bold text-blue-600">{data.total}</span> 筆有效資料
        </p>
        <p className="text-sm text-gray-500 mb-4">
          <span className="text-green-600 font-medium">新增 {data.newCount} 筆</span>
          {data.updateCount > 0 && (
            <span className="text-amber-600 font-medium ml-2">、覆蓋更新 {data.updateCount} 筆</span>
          )}
        </p>

        <div className="flex-1 overflow-auto border border-gray-200 rounded-lg mb-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50">
                {headers.map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rawPreview.map((row, i) => (
                <tr key={i} className="border-t border-gray-100">
                  {headers.map((h) => (
                    <td key={h} className="px-3 py-2 text-gray-600 whitespace-nowrap max-w-40 truncate">{row[h] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">取消</button>
          <button onClick={handleConfirm} disabled={importing}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >{importing ? '匯入中...' : `確認匯入 ${data.total} 筆`}</button>
        </div>
      </div>
    </div>
  )
}

/* ========== 共用欄位元件 ========== */

function FieldBlock({ label, required, className, children }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  )
}
