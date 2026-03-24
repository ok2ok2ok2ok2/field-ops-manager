/**
 * 維護記錄頁面 — 地動儀系統現場維護表
 * 版本: v1.3
 * 日期: 2026-03-24
 * 檔案: src/pages/MaintenanceList.jsx
 *
 * v1.3 變更：
 *  - 支援 URL ?search= 參數，從設備頁面帶入自動篩選
 *
 * v1.1 變更：
 *  - 移除設備選擇，站名改 datalist 自動補全
 */

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  getMaintenanceRecords, createRecord, updateRecord, deleteRecord,
  uploadMaintenancePhoto, deleteMaintenancePhoto, getStationNames,
} from '../api/maintenanceRecords'
import { useAuth } from '../contexts/AuthContext'
import ImageCropper from '../components/ImageCropper'
import MaintenanceReport from '../components/MaintenanceReport'
import { exportMaintenance } from '../utils/exportMaintenance'

/* ========== 常數 ========== */

const STATUS_FIELDS = [
  { key: 'environment', label: '環境狀態' },
  { key: 'instrument', label: '儀器狀態' },
  { key: 'communication', label: '通訊狀態' },
  { key: 'router_webserver', label: '路由器 web server' },
  { key: 'sftp', label: 'SFTP 架構' },
  { key: 'raspberry_ssh', label: '樹莓派 ssh 安全殼層通訊協定' },
  { key: 'seedlink', label: 'seedlink 即時地動數據回傳' },
]

const PHOTO_SLOTS = [
  { key: 'battery_1', label: '電池電量狀況', row: 1 },
  { key: 'battery_2', label: '電池電量狀況', row: 1 },
  { key: 'waterproof', label: '設備的水密檢修', row: 1 },
  { key: 'solar_panel', label: '太陽能板清潔', row: 1 },
  { key: 'wiring', label: '線路狀況', row: 2 },
  { key: 'level_direction', label: '地動儀水平、方位', row: 2 },
  { key: 'seismic_signal', label: '三軸地動訊號', row: 2 },
  { key: 'voltage_regulator', label: '降壓器電壓', row: 2 },
  { key: 'env_before_1', label: '環境整理前', row: 3 },
  { key: 'env_after_1', label: '環境整理後', row: 3 },
  { key: 'env_before_2', label: '環境整理前', row: 3 },
  { key: 'env_after_2', label: '環境整理後', row: 3 },
]

function toROCDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const rocYear = d.getFullYear() - 1911
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${rocYear}/${mm}/${dd}`
}

/* ========== 主元件 ========== */

export default function MaintenanceList() {
  const [searchParams] = useSearchParams()
  const { data: records, mutate } = useSWR('maintenance-records', getMaintenanceRecords)
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [editingRecord, setEditingRecord] = useState(null)
  const [showModal, setShowModal] = useState(false)

  // 輸出相關
  const [exportingRecord, setExportingRecord] = useState(null)
  const [showExportDialog, setShowExportDialog] = useState(false)

  const filtered = (records || []).filter((r) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      (r.station_name || '').toLowerCase().includes(s) ||
      (r.technician || '').toLowerCase().includes(s) ||
      (r.maintenance_date || '').includes(s)
    )
  })

  function handleCreate() { setEditingRecord(undefined); setShowModal(true) }
  function handleEdit(r) { setEditingRecord(r); setShowModal(true) }
  function handleClose() { setShowModal(false); setEditingRecord(null); mutate() }

  function handleExport(r) { setExportingRecord(r); setShowExportDialog(true) }
  function handleExportClose() { setShowExportDialog(false); setExportingRecord(null) }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-800">維護記錄</h2>
          <p className="text-xs text-gray-400 mt-0.5">地動儀系統現場維護表</p>
        </div>
        <button onClick={handleCreate}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >＋ 新增維護記錄</button>
      </div>

      {/* 搜尋 */}
      <div className="mb-4">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋站名、人員..."
          className="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">站名</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">維護日期</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">維護人員</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">照片</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const photoCount = Object.values(r.photos || {}).filter((p) => p && p.url).length
              return (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-800">{r.station_name || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-600">{toROCDate(r.maintenance_date)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-600">{r.technician || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${photoCount > 0 ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                      {photoCount}/12
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <button onClick={() => handleExport(r)}
                      className="text-xs text-green-600 hover:text-green-700 transition-colors">輸出</button>
                    <button onClick={() => handleEdit(r)}
                      className="text-xs text-blue-600 hover:text-blue-700 transition-colors">編輯</button>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-300">
                {records ? '沒有維護記錄' : '載入中...'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 新增/編輯 Modal */}
      {showModal && (
        <MaintenanceModal record={editingRecord} onClose={handleClose} />
      )}

      {/* 輸出對話框 */}
      {showExportDialog && exportingRecord && (
        <ExportDialog record={exportingRecord} onClose={handleExportClose} />
      )}
    </div>
  )
}

/* ================================================================
   輸出對話框
   ================================================================ */

function ExportDialog({ record, onClose }) {
  const [exportFormat, setExportFormat] = useState('pdf')
  const [dpi, setDpi] = useState(150)
  const [exporting, setExporting] = useState(false)
  const reportRef = useRef(null)

  async function handleExport() {
    if (!reportRef.current) return
    setExporting(true)
    try {
      const fileName = `維護表_${record.station_name || '未命名'}_${record.maintenance_date || ''}`
      await exportMaintenance(reportRef.current, {
        format: exportFormat,
        dpi,
        fileName,
      })
      toast.success('輸出完成')
      onClose()
    } catch (err) {
      toast.error('輸出失敗：' + err.message)
    }
    setExporting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">

        <h3 className="text-lg font-bold text-gray-800 mb-4">輸出維護表</h3>
        <p className="text-sm text-gray-500 mb-4">站名：{record.station_name || '—'} ／ {toROCDate(record.maintenance_date)}</p>

        {/* 格式選擇 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 mb-2">輸出格式</label>
          <div className="flex gap-2">
            {[
              { value: 'pdf', label: 'PDF' },
              { value: 'png', label: 'PNG' },
              { value: 'jpeg', label: 'JPEG' },
            ].map((opt) => (
              <button key={opt.value}
                onClick={() => setExportFormat(opt.value)}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  exportFormat === opt.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
              >{opt.label}</button>
            ))}
          </div>
        </div>

        {/* 解析度選擇 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-600 mb-2">解析度</label>
          <div className="flex gap-2">
            {[
              { value: 72, label: '72 dpi（快速預覽）' },
              { value: 150, label: '150 dpi（一般報告）' },
              { value: 300, label: '300 dpi（高品質列印）' },
            ].map((opt) => (
              <button key={opt.value}
                onClick={() => setDpi(opt.value)}
                className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                  dpi === opt.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
              >{opt.label}</button>
            ))}
          </div>
        </div>

        {/* 按鈕 */}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">取消</button>
          <button onClick={handleExport} disabled={exporting}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {exporting ? '輸出中...' : '開始輸出'}
          </button>
        </div>
      </div>

      {/* 隱藏的列印排版元件（供 html2canvas 擷取） */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <MaintenanceReport ref={reportRef} record={record} />
      </div>
    </div>
  )
}

/* ================================================================
   新增/編輯 Modal
   ================================================================ */

function MaintenanceModal({ record, onClose }) {
  const isEdit = !!record
  const { profile } = useAuth()

  const [form, setForm] = useState({
    station_name: '',
    maintenance_date: format(new Date(), 'yyyy-MM-dd'),
    technician: '',
    supervisor: '',
    notes: '',
    status_fields: {},
    photos: {},
  })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(null)

  // 裁切相關
  const [cropFile, setCropFile] = useState(null)       // 待裁切的原始檔案
  const [cropSlotKey, setCropSlotKey] = useState(null)  // 哪個格位觸發的

  // 站名清單
  const { data: stationNames } = useSWR('station-names', getStationNames)

  useEffect(() => {
    if (isEdit && record) {
      setForm({
        station_name: record.station_name || '',
        maintenance_date: record.maintenance_date || format(new Date(), 'yyyy-MM-dd'),
        technician: record.technician || '',
        supervisor: record.supervisor || '',
        notes: record.notes || '',
        status_fields: record.status_fields || {},
        photos: record.photos || {},
      })
    } else {
      setForm((prev) => ({ ...prev, technician: profile?.display_name || '' }))
    }
  }, [isEdit, record, profile])

  function handleChange(f, v) { setForm((prev) => ({ ...prev, [f]: v })) }

  function handleStatusChange(key, value) {
    setForm((prev) => ({
      ...prev,
      status_fields: { ...prev.status_fields, [key]: value },
    }))
  }

  // 選擇照片 → 先進裁切
  function handlePhotoSelect(slotKey, file) {
    if (!file) return
    setCropSlotKey(slotKey)
    setCropFile(file)
  }

  // 裁切完成 → 上傳
  async function handleCropConfirm(croppedFile) {
    const slotKey = cropSlotKey
    setCropFile(null)
    setCropSlotKey(null)

    setUploading(slotKey)
    try {
      const recordId = isEdit ? record.id : 'temp'
      const result = await uploadMaintenancePhoto(croppedFile, recordId)
      setForm((prev) => ({
        ...prev,
        photos: { ...prev.photos, [slotKey]: { url: result.url, name: result.name } },
      }))
      toast.success('照片已上傳')
    } catch (err) {
      toast.error('上傳失敗：' + err.message)
    }
    setUploading(null)
  }

  // 取消裁切
  function handleCropCancel() {
    setCropFile(null)
    setCropSlotKey(null)
  }

  // 移除照片
  async function handlePhotoRemove(slotKey) {
    const photo = form.photos[slotKey]
    if (!photo?.url) return
    try {
      await deleteMaintenancePhoto(photo.url)
      setForm((prev) => {
        const newPhotos = { ...prev.photos }
        delete newPhotos[slotKey]
        return { ...prev, photos: newPhotos }
      })
      toast.success('照片已移除')
    } catch (err) {
      toast.error('移除失敗：' + err.message)
    }
  }

  async function handleSave() {
    if (!form.station_name.trim()) { toast.error('請填寫站名'); return }
    if (!form.maintenance_date) { toast.error('請填寫維護日期'); return }
    setSaving(true)
    try {
      if (isEdit) {
        await updateRecord(record.id, form)
        toast.success('維護記錄已更新')
      } else {
        await createRecord(form)
        toast.success('維護記錄已新增')
      }
      onClose()
    } catch (err) { toast.error('儲存失敗：' + err.message) }
    setSaving(false)
  }

  async function handleDelete() {
    if (!isEdit) return
    if (!window.confirm('確定要刪除此維護記錄嗎？')) return
    try {
      await deleteRecord(record.id)
      toast.success('已刪除')
      onClose()
    } catch (err) { toast.error('刪除失敗：' + err.message) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">

        {/* 標題 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-800">
              {isEdit ? '編輯維護記錄' : '新增維護記錄'}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">地動儀系統現場維護表</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg transition-colors">✕</button>
        </div>

        {/* 表單內容 */}
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-6">

            {/* ── 基本資訊 ── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">站名 <span className="text-red-500">*</span></label>
                <input type="text" value={form.station_name}
                  onChange={(e) => handleChange('station_name', e.target.value)}
                  list="station-name-list"
                  placeholder="輸入或選擇站名（如 LHR1）"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <datalist id="station-name-list">
                  {(stationNames || []).map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">維護日期 <span className="text-red-500">*</span></label>
                <input type="date" value={form.maintenance_date} onChange={(e) => handleChange('maintenance_date', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">維護人員</label>
                <input type="text" value={form.technician} onChange={(e) => handleChange('technician', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">主管簽核</label>
                <input type="text" value={form.supervisor} onChange={(e) => handleChange('supervisor', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* ── 狀態欄位 ── */}
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-3 pb-2 border-b border-gray-100">狀態檢查</h4>
              <div className="grid grid-cols-2 gap-3">
                {STATUS_FIELDS.map((sf) => (
                  <div key={sf.key} className="flex items-center gap-3">
                    <label className="text-xs text-gray-500 w-48 flex-shrink-0 text-right">{sf.label}</label>
                    <input type="text" value={form.status_fields[sf.key] || ''}
                      onChange={(e) => handleStatusChange(sf.key, e.target.value)}
                      placeholder="正常"
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ))}
              </div>
            </div>

            {/* ── 12 格照片 ── */}
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-3 pb-2 border-b border-gray-100">
                現場照片
                <span className="text-xs text-gray-400 font-normal ml-2">
                  （{Object.values(form.photos).filter((p) => p && p.url).length}/12）
                </span>
              </h4>

              {[1, 2, 3].map((row) => (
                <div key={row} className="grid grid-cols-4 gap-3 mb-4">
                  {PHOTO_SLOTS.filter((s) => s.row === row).map((slot) => (
                    <PhotoSlot
                      key={slot.key}
                      slot={slot}
                      photo={form.photos[slot.key]}
                      uploading={uploading === slot.key}
                      onSelect={(file) => handlePhotoSelect(slot.key, file)}
                      onRemove={() => handlePhotoRemove(slot.key)}
                    />
                  ))}
                </div>
              ))}
            </div>

            {/* ── 備註 ── */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">備註</label>
              <textarea value={form.notes} rows={3} onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="補充說明..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

          </div>
        </div>

        {/* 底部按鈕 */}
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

      {/* 裁切對話框 */}
      {cropFile && (
        <ImageCropper
          imageFile={cropFile}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  )
}

/* ================================================================
   照片格子元件
   ================================================================ */

function PhotoSlot({ slot, photo, uploading, onSelect, onRemove }) {
  const fileRef = useRef(null)
  const hasPhoto = photo && photo.url

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs text-gray-500 mb-1 text-center truncate w-full">{slot.label}</p>
      <div
        className={`relative w-full aspect-[4/3] rounded-lg border-2 border-dashed overflow-hidden transition-colors ${
          hasPhoto ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50 cursor-pointer'
        }`}
        onClick={() => { if (!hasPhoto && !uploading) fileRef.current?.click() }}
      >
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-blue-500 animate-pulse">上傳中...</span>
          </div>
        ) : hasPhoto ? (
          <>
            <img src={photo.url} alt={slot.label}
              className="w-full h-full object-cover" />
            <button
              onClick={(e) => { e.stopPropagation(); onRemove() }}
              className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600 transition-colors"
            >✕</button>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl text-gray-300">📷</span>
            <span className="text-xs text-gray-400 mt-1">點擊上傳</span>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) onSelect(e.target.files[0]); e.target.value = '' }} />
    </div>
  )
}
