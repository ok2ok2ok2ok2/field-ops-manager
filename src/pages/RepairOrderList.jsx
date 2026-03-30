/**
 * 送修單管理頁面
 * 版本: v1.2
 * 日期: 2026-03-25
 * 檔案: src/pages/RepairOrderList.jsx
 *
 * v1.2：送修型號預設「移動攝影模組 Dj1208」+ 附圖說明文字 + 輸出帶附圖
 * v1.1：加入 PDF/圖片 輸出功能
 * v1.0：初版
 */

import { useState, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  getRepairOrders, createRepairOrder, updateRepairOrder, deleteRepairOrder,
} from '../api/repairOrders'
import { getDevices } from '../api/devices'
import { getClients } from '../api/clients'
import { uploadFile, deleteFile, parseAttachments, stringifyAttachments } from '../api/storage'
import { useAuth } from '../contexts/AuthContext'
import RepairOrderReport from '../components/RepairOrderReport'
import { exportMaintenance } from '../utils/exportMaintenance'

/* ========== 主元件 ========== */

export default function RepairOrderList() {
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const { data: orders, mutate } = useSWR('repair-orders', getRepairOrders)
  const { data: devices } = useSWR('devices', getDevices)
  const { data: clients } = useSWR('clients', getClients)

  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [editingOrder, setEditingOrder] = useState(null)
  const [showModal, setShowModal] = useState(false)

  // 輸出相關
  const [exportingOrder, setExportingOrder] = useState(null)
  const [exportingAttachments, setExportingAttachments] = useState([])
  const [showExportDialog, setShowExportDialog] = useState(false)
  const reportRef = useRef(null)

  // 只顯示 iroad 攝影機的設備
  const iroadDevices = useMemo(() => {
    if (!devices) return []
    return devices.filter((d) => d.name === 'iroad攝影機')
      .sort((a, b) => (a.device_code || '').localeCompare(b.device_code || ''))
  }, [devices])

  const clientMap = useMemo(() => {
    const map = {}
    if (clients) for (const c of clients) map[c.id] = c.name
    return map
  }, [clients])

  const filtered = useMemo(() => {
    if (!orders) return []
    if (!search.trim()) return orders
    const s = search.toLowerCase()
    return orders.filter((r) =>
      (r.client_name || '').toLowerCase().includes(s) ||
      (r.product_name || '').toLowerCase().includes(s) ||
      (r.model_name || '').toLowerCase().includes(s) ||
      (r.reason || '').toLowerCase().includes(s)
    )
  }, [orders, search])

  function handleCreate() {
    setEditingOrder(null)
    setShowModal(true)
  }

  function handleEdit(order) {
    setEditingOrder(order)
    setShowModal(true)
  }

  function handleModalClose() {
    setShowModal(false)
    setEditingOrder(null)
    mutate()
  }

  // 輸出按鈕
  function handleExportClick(e, order) {
    e.stopPropagation()
    const atts = parseAttachments(order.attachments)
    setExportingOrder(order)
    setExportingAttachments(atts)
    setShowExportDialog(true)
  }

  async function handleExport(fmt, dpi) {
    if (!reportRef.current || !exportingOrder) return
    const fileName = `送修單_${exportingOrder.product_name || '未命名'}_${exportingOrder.repair_date || ''}`
    try {
      await new Promise((r) => setTimeout(r, 500))
      await exportMaintenance(reportRef.current, { format: fmt, dpi, fileName })
      toast.success('輸出完成')
    } catch (err) {
      toast.error('輸出失敗：' + err.message)
    }
    setShowExportDialog(false)
    setExportingOrder(null)
    setExportingAttachments([])
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* 標題 + 按鈕 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">送修單管理</h1>
          <p className="text-sm text-gray-400 mt-1">iroad 攝影機送修記錄</p>
        </div>
        <button onClick={handleCreate}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >＋ 新增送修單</button>
      </div>

      {/* 搜尋 */}
      <div className="mb-4">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋送修單位、產品、型號、原因..."
          className="w-full max-w-md px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 列表 */}
      {!orders ? (
        <p className="text-gray-400 text-sm py-10 text-center">載入中...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-400 text-sm py-10 text-center">
          {search ? '找不到符合的送修單' : '尚無送修記錄，點擊上方按鈕新增'}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => {
            const attachments = parseAttachments(order.attachments)
            return (
              <div key={order.id} onClick={() => handleEdit(order)}
                className="bg-white border border-gray-200 rounded-xl px-5 py-4 cursor-pointer hover:ring-1 hover:ring-blue-300 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-sm font-bold text-gray-800">{order.product_name || '（未填產品）'}</span>
                      <span className="text-xs text-gray-400">{order.repair_date}</span>
                      {attachments.length > 0 && (
                        <span className="text-xs text-blue-400">📎 {attachments.length}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 truncate">
                      <span className="text-gray-400">送修單位：</span>{order.client_name || '—'}
                    </p>
                    {order.model_name && (
                      <p className="text-xs text-gray-400 mt-0.5">型號：{order.model_name}</p>
                    )}
                    {order.reason && (
                      <p className="text-xs text-gray-500 mt-1 truncate">原因：{order.reason}</p>
                    )}
                  </div>
                  <button onClick={(e) => handleExportClick(e, order)}
                    className="flex-shrink-0 ml-3 px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                  >📄 輸出</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <RepairOrderModal
          order={editingOrder}
          iroadDevices={iroadDevices}
          clientMap={clientMap}
          onClose={handleModalClose}
        />
      )}

      {/* 隱藏渲染區（輸出用）★ v1.2：傳入 attachments */}
      {exportingOrder && (
        <div style={{ position: 'fixed', left: -9999, top: 0 }}>
          <RepairOrderReport ref={reportRef} order={exportingOrder} attachments={exportingAttachments} />
        </div>
      )}

      {/* 輸出格式選擇 Dialog */}
      {showExportDialog && (
        <ExportDialog
          onExport={handleExport}
          onClose={() => { setShowExportDialog(false); setExportingOrder(null); setExportingAttachments([]) }}
        />
      )}
    </div>
  )
}

/* ================================================================
   輸出格式選擇 Dialog
   ================================================================ */

function ExportDialog({ onExport, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl p-6 w-80">
        <h3 className="text-base font-bold text-gray-800 mb-4">選擇輸出格式</h3>
        <div className="space-y-2">
          <button onClick={() => onExport('pdf', 150)}
            className="w-full text-left px-4 py-3 rounded-lg bg-gray-50 hover:bg-blue-50 text-sm transition-colors"
          >📄 PDF（150 dpi）</button>
          <button onClick={() => onExport('pdf', 300)}
            className="w-full text-left px-4 py-3 rounded-lg bg-gray-50 hover:bg-blue-50 text-sm transition-colors"
          >📄 PDF（300 dpi 高畫質）</button>
          <button onClick={() => onExport('png', 150)}
            className="w-full text-left px-4 py-3 rounded-lg bg-gray-50 hover:bg-blue-50 text-sm transition-colors"
          >🖼️ PNG 圖片</button>
          <button onClick={() => onExport('jpeg', 150)}
            className="w-full text-left px-4 py-3 rounded-lg bg-gray-50 hover:bg-blue-50 text-sm transition-colors"
          >🖼️ JPEG 圖片</button>
        </div>
        <button onClick={onClose}
          className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >取消</button>
      </div>
    </div>
  )
}

/* ================================================================
   送修單 Modal
   ================================================================ */

const DEFAULT_MODEL = '移動攝影模組 Dj1208'

const EMPTY_FORM = {
  device_id: '',
  repair_date: format(new Date(), 'yyyy-MM-dd'),
  client_name: '',
  product_name: '',
  model_name: DEFAULT_MODEL,
  reason: '',
  notes: '',
}

function RepairOrderModal({ order, iroadDevices, clientMap, onClose }) {
  const isEdit = !!order
  const [form, setForm] = useState(() => {
    if (isEdit) {
      return {
        device_id: order.device_id || '',
        repair_date: order.repair_date || '',
        client_name: order.client_name || '',
        product_name: order.product_name || '',
        model_name: order.model_name || DEFAULT_MODEL,
        reason: order.reason || '',
        notes: order.notes || '',
      }
    }
    return { ...EMPTY_FORM }
  })

  // ★ v1.2：attachments 帶 caption 欄位
  const [attachments, setAttachments] = useState(() =>
    isEdit ? parseAttachments(order.attachments).map((a) => ({ ...a, caption: a.caption || '' })) : []
  )
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  function handleChange(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // 選設備 → 自動帶入產品名稱、客戶名稱
  function handleDeviceSelect(deviceId) {
    handleChange('device_id', deviceId)
    if (!deviceId) return

    const device = iroadDevices.find((d) => d.id === deviceId)
    if (!device) return

    handleChange('product_name', device.device_code || '')

    if (device.client_id && clientMap[device.client_id]) {
      handleChange('client_name', clientMap[device.client_id])
    }
  }

  // 上傳附圖
  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setUploading(true)
    try {
      const folder = isEdit ? order.id : 'repair-temp'
      const result = await uploadFile(file, folder)
      setAttachments((prev) => [...prev, { url: result.url, name: result.originalName, caption: '' }])
      toast.success('附圖已上傳')
    } catch (err) {
      toast.error('上傳失敗：' + err.message)
    }
    setUploading(false)
  }

  // ★ v1.2：更新附圖說明文字
  function handleCaptionChange(idx, caption) {
    setAttachments((prev) => prev.map((a, i) => i === idx ? { ...a, caption } : a))
  }

  // 移除附圖
  async function handleRemoveAttachment(idx) {
    const item = attachments[idx]
    if (!item) return
    try {
      await deleteFile(item.url)
      setAttachments((prev) => prev.filter((_, i) => i !== idx))
      toast.success('附圖已移除')
    } catch (err) {
      toast.error('移除失敗：' + err.message)
    }
  }

  async function handleSave() {
    if (!form.product_name.trim()) { toast.error('請填寫送修產品'); return }
    if (!form.client_name.trim()) { toast.error('請填寫送修單位'); return }
    if (!form.repair_date) { toast.error('請填寫送修日期'); return }

    setSaving(true)
    try {
      const payload = {
        ...form,
        device_id: form.device_id || null,
        attachments: stringifyAttachments(attachments) || '[]',
      }

      if (isEdit) {
        await updateRepairOrder(order.id, payload)
        toast.success('送修單已更新')
      } else {
        await createRepairOrder(payload)
        toast.success('送修單已新增')
      }
      onClose()
    } catch (err) {
      toast.error('儲存失敗：' + err.message)
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!isEdit) return
    if (!window.confirm('確定要刪除此送修單嗎？')) return
    try {
      await deleteRepairOrder(order.id)
      toast.success('已刪除')
      onClose()
    } catch (err) {
      toast.error('刪除失敗：' + err.message)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">

        {/* 標題 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">
            {isEdit ? '編輯送修單' : '新增送修單'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {/* 表單 */}
        <div className="flex-1 overflow-auto px-6 py-5 space-y-4">

          {/* 送修日期 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">送修日期</label>
            <input type="date" value={form.repair_date}
              onChange={(e) => handleChange('repair_date', e.target.value)}
              className="w-48 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 選擇設備 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">選擇設備（自動帶入產品+客戶）</label>
            <select value={form.device_id}
              onChange={(e) => handleDeviceSelect(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— 手動填寫 —</option>
              {iroadDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.device_code}{d.location ? ` (${d.location})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 送修產品 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">送修產品（設備編號）</label>
            <input type="text" value={form.product_name}
              onChange={(e) => handleChange('product_name', e.target.value)}
              placeholder="如 Brickcom062"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 送修單位 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">送修單位</label>
            <input type="text" value={form.client_name}
              onChange={(e) => handleChange('client_name', e.target.value)}
              placeholder="客戶名稱 + 補充（如 宏錩工程有限公司-水利局）"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 送修型號 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">送修型號</label>
            <input type="text" value={form.model_name}
              onChange={(e) => handleChange('model_name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 送修原因 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">送修原因</label>
            <textarea value={form.reason}
              onChange={(e) => handleChange('reason', e.target.value)}
              rows={2}
              placeholder="如 韌體異常導致通訊不穩，更換備品請工廠排查原因。"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* 備註 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <textarea value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* 附圖 ★ v1.2：每張圖加說明文字輸入 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              附圖 {attachments.length > 0 && `（${attachments.length} 張）`}
            </label>

            {attachments.length > 0 && (
              <div className="space-y-3 mb-3">
                {attachments.map((att, idx) => (
                  <div key={idx} className="flex gap-3 items-start border border-gray-200 rounded-lg p-2">
                    <div className="relative group flex-shrink-0 w-28">
                      <img src={att.url} alt={att.name}
                        className="w-full aspect-[4/3] object-cover rounded" />
                      <button
                        onClick={() => handleRemoveAttachment(idx)}
                        className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >✕</button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400 truncate mb-1">{att.name}</p>
                      <input type="text" value={att.caption || ''}
                        onChange={(e) => handleCaptionChange(idx, e.target.value)}
                        placeholder="輸入說明文字..."
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="px-4 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50"
            >
              {uploading ? '上傳中...' : '📎 新增附圖'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={handleFileSelect} />
          </div>
        </div>

        {/* 底部按鈕 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
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
