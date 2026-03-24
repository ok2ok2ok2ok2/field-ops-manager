/**
 * 設備管理頁面
 * 版本: v1.7
 * 日期: 2026-03-24
 * 檔案: src/pages/DeviceList.jsx
 *
 * v1.7 變更：
 *  - 維護記錄入口移到狀態欄旁邊（同一行），用 device_code 帶參數篩選
 *  - 移除底部維護記錄佔位區塊
 *
 * v1.5 修改：
 *  - 匯入策略改為：device_code 匹配，有就更新、沒有就新增
 *  - 預覽 Modal 顯示新增/更新筆數
 */

import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { getDevices, createDevice, updateDevice, deleteDevice } from '../api/devices'
import { getClients } from '../api/clients'
import { exportToFile, parseImportFile, mapImportData } from '../utils/importExport'

/* ========== 常數 ========== */

const STATUS_OPTIONS = ['正常', '維修中', '報廢']

const STATUS_STYLE = {
  '正常':   'bg-green-100 text-green-700',
  '維修中': 'bg-amber-100 text-amber-700',
  '報廢':   'bg-red-100 text-red-700',
}

const EMPTY_FORM = {
  name: '',
  device_code: '',
  model: '',
  location: '',
  purchase_date: '',
  status: '正常',
  notes: '',
  client_id: '',
}

function isIroad(device) {
  return device?.name === 'iroad 攝影機'
}

function buildClientMap(clients) {
  const map = {}
  if (!clients) return map
  for (const c of clients) map[c.id] = c.name
  return map
}

function buildClientNameToId(clients) {
  const map = {}
  if (!clients) return map
  for (const c of clients) map[c.name] = c.id
  return map
}

/* ========== 主元件 ========== */

export default function DeviceList() {
  const { data: devices, error, isLoading, mutate } = useSWR('devices', getDevices)
  const { data: clients } = useSWR('clients', getClients)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingDevice, setEditingDevice] = useState(null)
  const [importData, setImportData] = useState(null)
  const [showExportMenu, setShowExportMenu] = useState(false)

  const clientMap = useMemo(() => buildClientMap(clients), [clients])
  const clientNameToId = useMemo(() => buildClientNameToId(clients), [clients])

  const DEVICE_COLUMNS = useMemo(() => [
    { header: '設備名稱', key: 'name' },
    { header: '設備編號', key: 'device_code' },
    { header: '型號',     key: 'model' },
    { header: '安裝地點', key: 'location' },
    { header: '狀態',     key: 'status' },
    { header: '所屬客戶', key: 'client_id',
      transform: (item) => clientMap[item.client_id] || '',
      reverseTransform: (val) => clientNameToId[val] || null,
    },
    { header: '購買日期', key: 'purchase_date' },
    { header: '備註',     key: 'notes' },
  ], [clientMap, clientNameToId])

  const filtered = useMemo(() => {
    if (!devices) return []
    return devices.filter((d) => {
      const matchStatus = !filterStatus || d.status === filterStatus
      const keyword = search.trim().toLowerCase()
      if (!keyword) return matchStatus
      const clientName = clientMap[d.client_id] || ''
      const matchSearch =
        (d.name || '').toLowerCase().includes(keyword) ||
        (d.device_code || '').toLowerCase().includes(keyword) ||
        (d.model || '').toLowerCase().includes(keyword) ||
        (d.location || '').toLowerCase().includes(keyword) ||
        clientName.toLowerCase().includes(keyword)
      return matchStatus && matchSearch
    })
  }, [devices, search, filterStatus, clientMap])

  async function handleCreate(formData) {
    try {
      await createDevice(formData)
      mutate()
      setShowModal(false)
      toast.success('設備已建立')
    } catch (err) {
      toast.error('建立失敗：' + err.message)
    }
  }

  async function handleUpdate(id, formData) {
    try {
      await updateDevice(id, formData)
      mutate()
      setEditingDevice(null)
      toast.success('設備已更新')
    } catch (err) {
      toast.error('更新失敗：' + err.message)
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`確定要刪除「${name}」嗎？相關維護記錄也會一併刪除，此操作無法復原。`)) return
    try {
      await deleteDevice(id)
      mutate()
      setEditingDevice(null)
      toast.success('設備已刪除')
    } catch (err) {
      toast.error('刪除失敗：' + err.message)
    }
  }

  function handleExport(format) {
    setShowExportMenu(false)
    if (!devices || devices.length === 0) {
      toast.error('沒有資料可匯出')
      return
    }
    exportToFile(devices, DEVICE_COLUMNS, '設備資料', format)
    toast.success(`已匯出 ${devices.length} 台設備（${format.toUpperCase()}）`)
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const raw = await parseImportFile(file)
      const mapped = mapImportData(raw, DEVICE_COLUMNS)
      const valid = mapped.filter((r) => r.name)
      if (valid.length === 0) {
        toast.error('檔案中沒有有效資料（缺少「設備名稱」欄位）')
        return
      }

      // 比對現有設備的 device_code，標記新增/更新
      const existingMap = {}
      for (const d of (devices || [])) {
        if (d.device_code) {
          existingMap[d.device_code] = d.id
        }
      }

      let newCount = 0
      let updateCount = 0
      for (const row of valid) {
        if (row.device_code && existingMap[row.device_code]) {
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
        const submitData = { ...row }
        if (!submitData.client_id) submitData.client_id = null
        if (!submitData.status) submitData.status = '正常'

        const existingId = row.device_code ? existingMap[row.device_code] : null
        if (existingId) {
          await updateDevice(existingId, submitData)
          updated++
        } else {
          await createDevice(submitData)
          created++
        }
      } catch {
        fail++
      }
    }

    mutate()
    setImportData(null)

    const parts = []
    if (created > 0) parts.push(`新增 ${created} 台`)
    if (updated > 0) parts.push(`更新 ${updated} 台`)
    if (fail > 0) parts.push(`失敗 ${fail} 台`)

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
          <h2 className="text-xl font-bold text-gray-800">設備管理</h2>
          <p className="text-gray-400 text-sm mt-1">
            共 {(devices || []).length} 台設備
            {filtered.length !== (devices || []).length && `，顯示 ${filtered.length} 筆`}
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
          <button onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >＋ 新增設備</button>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋名稱、編號、型號、地點、客戶..."
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">全部狀態</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="hidden sm:flex items-center gap-4 px-4 py-2 text-xs text-gray-400 font-medium border-b border-gray-100">
        <span className="w-28">編號</span>
        <span className="flex-1">名稱</span>
        <span className="w-24">型號</span>
        <span className="w-24">客戶</span>
        <span className="w-24">安裝地點</span>
        <span className="w-16 text-center">狀態</span>
        <span className="w-24 text-right">更新時間</span>
      </div>

      <div className="space-y-1 mt-1">
        {filtered.length === 0 ? (
          <p className="text-gray-400 text-sm py-8 text-center">
            {search || filterStatus ? '沒有符合的設備' : '尚無設備資料'}
          </p>
        ) : (
          filtered.map((device) => (
            <DeviceRow key={device.id} device={device}
              clientName={clientMap[device.client_id] || ''}
              isActive={editingDevice?.id === device.id}
              onClick={() => setEditingDevice(device)}
            />
          ))
        )}
      </div>

      {showModal && (
        <DeviceModal clients={clients || []} onClose={() => setShowModal(false)} onSave={handleCreate} />
      )}

      {editingDevice && (
        <DeviceEditModal device={editingDevice} clients={clients || []}
          onClose={() => setEditingDevice(null)} onSave={handleUpdate} onDelete={handleDelete}
        />
      )}

      {importData && (
        <ImportPreviewModal data={importData} columns={DEVICE_COLUMNS}
          onConfirm={handleImportConfirm} onCancel={() => setImportData(null)}
        />
      )}
    </div>
  )
}

/* ========== 設備列表行 ========== */

function DeviceRow({ device, clientName, isActive, onClick }) {
  const statusStyle = STATUS_STYLE[device.status] || STATUS_STYLE['正常']
  const updatedAt = device.updated_at
    ? format(new Date(device.updated_at), 'MM/dd HH:mm', { locale: zhTW })
    : '—'

  return (
    <div onClick={onClick}
      className={`flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer transition-all ${
        isActive ? 'bg-blue-50 border border-blue-200' : 'bg-white border border-gray-100 hover:bg-gray-50 hover:shadow-sm'
      }`}
    >
      <span className="w-28 text-xs font-mono text-gray-500 truncate">{device.device_code || '—'}</span>
      <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-800 truncate">{device.name}</p></div>
      <span className="hidden sm:block w-24 text-xs text-gray-400 truncate">{device.model || '—'}</span>
      <span className="hidden sm:block w-24 text-xs text-gray-500 truncate">{clientName || '—'}</span>
      <span className="hidden sm:block w-24 text-xs text-gray-400 truncate">{device.location || '—'}</span>
      <span className={`w-16 text-center text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${statusStyle}`}>{device.status}</span>
      <span className="hidden sm:block w-24 text-right text-xs text-gray-400">{updatedAt}</span>
    </div>
  )
}

/* ========== 編輯 Modal ========== */

function DeviceEditModal({ device, clients, onClose, onSave, onDelete }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({ ...device })
  const [saving, setSaving] = useState(false)
  const [showLocation, setShowLocation] = useState(!!device.location)
  const deviceIsIroad = isIroad(form)

  function handleChange(field, value) { setForm((prev) => ({ ...prev, [field]: value })) }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('設備名稱不可為空'); return }
    setSaving(true)
    const { id, created_at, updated_at, image_url, ...updates } = form
    if (!updates.client_id) updates.client_id = null
    await onSave(device.id, updates)
    setSaving(false)
  }

  function handleGoMaintenance() {
    onClose()
    const searchVal = device.device_code || ''
    navigate(searchVal ? `/maintenance?search=${encodeURIComponent(searchVal)}` : '/maintenance')
  }

  const createdAt = device.created_at ? format(new Date(device.created_at), 'yyyy/MM/dd HH:mm', { locale: zhTW }) : '—'
  const updatedAt = device.updated_at ? format(new Date(device.updated_at), 'yyyy/MM/dd HH:mm', { locale: zhTW }) : '—'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">設備詳細</h3>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>建立：{createdAt}</span><span>·</span><span>更新：{updatedAt}</span>
            <button onClick={onClose} className="ml-3 text-gray-400 hover:text-gray-600 text-lg transition-colors">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <FieldBlock label="設備名稱" required>
                <input type="text" value={form.name || ''} onChange={(e) => handleChange('name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </FieldBlock>
            </div>
            <FieldBlock label="設備編號">
              <input type="text" value={form.device_code || ''} onChange={(e) => handleChange('device_code', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </FieldBlock>
            <FieldBlock label="型號">
              <input type="text" value={form.model || ''} onChange={(e) => handleChange('model', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </FieldBlock>
            <FieldBlock label="狀態">
              <select value={form.status || '正常'} onChange={(e) => handleChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >{STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </FieldBlock>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">維護記錄</label>
              <button onClick={handleGoMaintenance}
                className="w-full px-3 py-2 text-sm text-blue-600 font-medium bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
                🔬 查看維護記錄{device.device_code ? `（${device.device_code}）` : ''}
              </button>
            </div>

            <div className="col-span-2">
              <FieldBlock label="所屬客戶">
                <select value={form.client_id || ''} onChange={(e) => handleChange('client_id', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">無（未指定客戶）</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </FieldBlock>
            </div>

            {!deviceIsIroad && (
              <div className="col-span-2">
                <button type="button" onClick={() => setShowLocation(!showLocation)}
                  className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <span className={`transition-transform ${showLocation ? 'rotate-90' : ''}`}>▶</span>
                  安裝地點
                  {form.location && <span className="text-xs text-gray-400 ml-1">（{form.location}）</span>}
                </button>
                {showLocation && (
                  <div className="mt-2">
                    <input type="text" value={form.location || ''} onChange={(e) => handleChange('location', e.target.value)}
                      placeholder="填寫安裝地點"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                )}
              </div>
            )}

            <div className="col-span-2">
              <FieldBlock label="備註">
                <textarea value={form.notes || ''} rows={3} onChange={(e) => handleChange('notes', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </FieldBlock>
            </div>

            <FieldBlock label="購買日期">
              <input type="date" value={form.purchase_date || ''} onChange={(e) => handleChange('purchase_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </FieldBlock>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <button onClick={() => onDelete(device.id, device.name)} className="text-sm text-red-500 hover:text-red-700 transition-colors">刪除設備</button>
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

/* ========== 新增設備 Modal ========== */

function DeviceModal({ clients, onClose, onSave }) {
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [submitting, setSubmitting] = useState(false)

  function handleChange(field, value) { setForm((prev) => ({ ...prev, [field]: value })) }

  async function handleSubmit() {
    if (!form.name.trim()) { toast.error('請輸入設備名稱'); return }
    setSubmitting(true)
    const submitData = { ...form }
    if (!submitData.client_id) submitData.client_id = null
    await onSave(submitData)
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 max-h-[85vh] overflow-auto">
        <h3 className="text-lg font-bold text-gray-800 mb-4">新增設備</h3>
        <div className="space-y-4">
          <FormField label="設備名稱" required>
            <input type="text" value={form.name} onChange={(e) => handleChange('name', e.target.value)}
              placeholder="例：iroad 攝影機"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </FormField>
          <div className="flex gap-3">
            <FormField label="設備編號" className="flex-1">
              <input type="text" value={form.device_code} onChange={(e) => handleChange('device_code', e.target.value)}
                placeholder="例：DjtechA001034"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </FormField>
            <FormField label="狀態" className="w-28">
              <select value={form.status} onChange={(e) => handleChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >{STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </FormField>
          </div>
          <FormField label="型號">
            <input type="text" value={form.model} onChange={(e) => handleChange('model', e.target.value)}
              placeholder="例：aioto"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </FormField>
          <FormField label="所屬客戶">
            <select value={form.client_id} onChange={(e) => handleChange('client_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">無（未指定客戶）</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="安裝地點">
            <input type="text" value={form.location} onChange={(e) => handleChange('location', e.target.value)}
              placeholder="選填"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </FormField>
          <FormField label="購買日期">
            <input type="date" value={form.purchase_date} onChange={(e) => handleChange('purchase_date', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </FormField>
          <FormField label="備註">
            <textarea value={form.notes} rows={2} onChange={(e) => handleChange('notes', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </FormField>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">取消</button>
          <button onClick={handleSubmit} disabled={submitting}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >{submitting ? '建立中...' : '建立設備'}</button>
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
            <span className="text-amber-600 font-medium ml-2">、覆蓋更新 {data.updateCount} 筆（依設備編號匹配）</span>
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

function FormField({ label, required, className, children }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  )
}
