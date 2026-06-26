/**
 * 機動維護頁面 — 自訂照片格的維護表
 * 版本: v1.0
 * 日期: 2026-06-26
 * 檔案: src/pages/AdHocMaintenanceList.jsx
 *
 * 與 MaintenanceList 共用 maintenance_records 表 (type='機動')
 * 照片區改為使用者自訂的 EditableSlotGrid (含 photo_slots jsonb 欄位)
 */

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  getMaintenanceRecords, createRecord, updateRecord, deleteRecord,
  uploadMaintenancePhoto, deleteMaintenancePhoto, uploadSignatureImage, getStationNames,
  getLatestAdHocSlots,
} from '../api/maintenanceRecords'
import ImageCropper from '../components/ImageCropper'
import AdHocMaintenanceReport from '../components/AdHocMaintenanceReport'
import EditableSlotGrid from '../components/EditableSlotGrid'
import { exportMaintenance } from '../utils/exportMaintenance'

const STATUS_FIELDS = [
  { key: 'environment',      label: '環境狀態' },
  { key: 'instrument',       label: '儀器狀態' },
  { key: 'router_webserver', label: '路由器 web server' },
  { key: 'raspberry_ssh',    label: '樹莓派 ssh' },
  { key: 'communication',    label: '通訊狀態' },
  { key: 'sftp',             label: 'SFTP 架構' },
  { key: 'seedlink',         label: 'seedlink 即時地動數據回傳' },
]

function toROCDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const rocYear = d.getFullYear() - 1911
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${rocYear}/${mm}/${dd}`
}

export default function AdHocMaintenanceList() {
  const [searchParams] = useSearchParams()
  const { data: records, mutate } = useSWR(
    'maintenance-records:adhoc',
    () => getMaintenanceRecords({ type: '機動' }),
  )
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [editingRecord, setEditingRecord] = useState(null)
  const [showModal, setShowModal] = useState(false)

  const [exportingRecord, setExportingRecord] = useState(null)
  const [showExportDialog, setShowExportDialog] = useState(false)

  const filtered = (records || []).filter((r) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      (r.station_name || '').toLowerCase().includes(s) ||
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
          <h2 className="text-lg font-bold text-gray-800">機動維護</h2>
          <p className="text-xs text-gray-400 mt-0.5">照片格可自訂大小與名稱</p>
        </div>
        <button onClick={handleCreate}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >＋ 新增機動維護</button>
      </div>

      <div className="mb-4">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋站名、人員..."
          className="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

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
              const slotCount = (r.photo_slots || []).length
              return (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-800">{r.station_name || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-600">{toROCDate(r.maintenance_date)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-600">
                      {r.technician_img?.url ? '已簽署' : (r.technician || '—')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${photoCount > 0 ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                      {photoCount}/{slotCount || '—'}
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
                {records ? '沒有機動維護紀錄' : '載入中...'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <AdHocMaintenanceModal record={editingRecord} onClose={handleClose} />
      )}

      {showExportDialog && exportingRecord && (
        <ExportDialog record={exportingRecord} onClose={handleExportClose} />
      )}
    </div>
  )
}

/* ── 匯出對話框 (與定期版相同,但用 AdHocMaintenanceReport) ── */

function ExportDialog({ record, onClose }) {
  const [exportFormat, setExportFormat] = useState('pdf')
  const [dpi, setDpi] = useState(150)
  const [exporting, setExporting] = useState(false)
  const reportRef = useRef(null)

  async function handleExport() {
    if (!reportRef.current) return
    setExporting(true)
    try {
      const fileName = `機動維護_${record.station_name || '未命名'}_${record.maintenance_date || ''}`
      await exportMaintenance(reportRef.current, { format: exportFormat, dpi, fileName })
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
        <h3 className="text-lg font-bold text-gray-800 mb-4">輸出機動維護表</h3>
        <p className="text-sm text-gray-500 mb-4">站名：{record.station_name || '—'} ／ {toROCDate(record.maintenance_date)}</p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 mb-2">輸出格式</label>
          <div className="flex gap-2">
            {[{ value: 'pdf', label: 'PDF' }, { value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPEG' }].map((opt) => (
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

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">取消</button>
          <button onClick={handleExport} disabled={exporting}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {exporting ? '輸出中...' : '開始輸出'}
          </button>
        </div>
      </div>

      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <AdHocMaintenanceReport ref={reportRef} record={record} />
      </div>
    </div>
  )
}

/* ── 新增/編輯 Modal ── */

function AdHocMaintenanceModal({ record, onClose }) {
  const isEdit = !!record

  const [form, setForm] = useState({
    station_name: '',
    maintenance_date: format(new Date(), 'yyyy-MM-dd'),
    technician_img: null,
    supervisor_img: null,
    notes: '',
    status_fields: {},
    photos: {},
    photo_slots: [],
  })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(null)
  const [cropFile, setCropFile] = useState(null)
  const [cropSlotKey, setCropSlotKey] = useState(null)

  const { data: stationNames } = useSWR('station-names', getStationNames)

  // 編輯: 載入既有記錄;新增: 帶最近一筆機動模板
  useEffect(() => {
    if (isEdit && record) {
      setForm({
        station_name: record.station_name || '',
        maintenance_date: record.maintenance_date || format(new Date(), 'yyyy-MM-dd'),
        technician_img: record.technician_img || null,
        supervisor_img: record.supervisor_img || null,
        notes: record.notes || '',
        status_fields: record.status_fields || {},
        photos: record.photos || {},
        photo_slots: record.photo_slots || [],
      })
    } else if (!isEdit) {
      // 新增 → 抓最近一筆機動的 slot 配置當模板,但清空 photos
      getLatestAdHocSlots().then((latestSlots) => {
        // 把 id 換新,避免和歷史記錄的 photos 鍵衝突
        const fresh = (latestSlots || []).map((s) => ({
          ...s,
          id: crypto.randomUUID(),
        }))
        setForm((prev) => ({ ...prev, photo_slots: fresh }))
      }).catch(() => {/* 抓不到模板就空著 */})
    }
  }, [isEdit, record])

  function handleChange(f, v) { setForm((prev) => ({ ...prev, [f]: v })) }

  function handleStatusChange(key, value) {
    setForm((prev) => ({
      ...prev,
      status_fields: { ...prev.status_fields, [key]: value },
    }))
  }

  function handleSlotsChange(newSlots) {
    setForm((prev) => ({ ...prev, photo_slots: newSlots }))
  }

  function handlePhotoSelect(slotId, file) {
    if (!file) return
    setCropSlotKey(slotId)
    setCropFile(file)
  }

  async function handleCropConfirm(croppedFile) {
    const slotId = cropSlotKey
    setCropFile(null)
    setCropSlotKey(null)
    setUploading(slotId)
    try {
      const recordId = isEdit ? record.id : 'temp'
      const result = await uploadMaintenancePhoto(croppedFile, recordId)
      setForm((prev) => ({
        ...prev,
        photos: { ...prev.photos, [slotId]: { url: result.url, name: result.name } },
      }))
      toast.success('照片已上傳')
    } catch (err) {
      toast.error('上傳失敗：' + err.message)
    }
    setUploading(null)
  }

  function handleCropCancel() {
    setCropFile(null)
    setCropSlotKey(null)
  }

  async function handleSigSelect(role, file) {
    if (!file) return
    setUploading(`sig_${role}`)
    try {
      const recordId = isEdit ? record.id : 'temp'
      const result = await uploadSignatureImage(file, recordId, role)
      setForm((prev) => ({ ...prev, [`${role}_img`]: { url: result.url, name: result.name } }))
      toast.success('簽名已上傳')
    } catch (err) {
      toast.error('上傳失敗：' + err.message)
    }
    setUploading(null)
  }

  async function handleSigRemove(role) {
    const img = form[`${role}_img`]
    if (!img?.url) return
    try {
      await deleteMaintenancePhoto(img.url)
      setForm((prev) => ({ ...prev, [`${role}_img`]: null }))
      toast.success('簽名已移除')
    } catch (err) {
      toast.error('移除失敗：' + err.message)
    }
  }

  async function handlePhotoRemove(slotId) {
    const photo = form.photos[slotId]
    if (!photo?.url) return
    try {
      await deleteMaintenancePhoto(photo.url)
      setForm((prev) => {
        const newPhotos = { ...prev.photos }
        delete newPhotos[slotId]
        return { ...prev, photos: newPhotos }
      })
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
        toast.success('已更新')
      } else {
        await createRecord({ ...form, type: '機動' })
        toast.success('已新增')
      }
      onClose()
    } catch (err) { toast.error('儲存失敗：' + err.message) }
    setSaving(false)
  }

  async function handleDelete() {
    if (!isEdit) return
    if (!window.confirm('確定要刪除此機動維護紀錄嗎？')) return
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

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-800">
              {isEdit ? '編輯機動維護' : '新增機動維護'}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">照片格可自訂</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-6">

            {/* 基本資訊 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">站名 <span className="text-red-500">*</span></label>
                <input type="text" value={form.station_name}
                  onChange={(e) => handleChange('station_name', e.target.value)}
                  list="station-name-list"
                  placeholder="輸入或選擇站名"
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

            {/* 簽名 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">維護人員簽名</label>
                <SignatureSlot
                  img={form.technician_img}
                  uploading={uploading === 'sig_technician'}
                  onSelect={(file) => handleSigSelect('technician', file)}
                  onRemove={() => handleSigRemove('technician')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">主管簽核簽名</label>
                <SignatureSlot
                  img={form.supervisor_img}
                  uploading={uploading === 'sig_supervisor'}
                  onSelect={(file) => handleSigSelect('supervisor', file)}
                  onRemove={() => handleSigRemove('supervisor')}
                />
              </div>
            </div>

            {/* 狀態欄位 */}
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-3 pb-2 border-b border-gray-100">狀態檢查</h4>
              <div className="grid grid-cols-4 gap-3">
                {STATUS_FIELDS.map((sf) => (
                  <div key={sf.key}>
                    <label className="text-xs text-gray-500 block mb-1 truncate" title={sf.label}>{sf.label}</label>
                    <input type="text" value={form.status_fields[sf.key] || ''}
                      onChange={(e) => handleStatusChange(sf.key, e.target.value)}
                      placeholder="正常"
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ))}
              </div>
            </div>

            {/* 自訂照片格 */}
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-3 pb-2 border-b border-gray-100">
                現場照片
                <span className="text-xs text-gray-400 font-normal ml-2">
                  （{Object.values(form.photos).filter((p) => p && p.url).length}/{form.photo_slots.length}）
                </span>
              </h4>
              <EditableSlotGrid
                slots={form.photo_slots}
                photos={form.photos}
                uploading={uploading}
                onSlotsChange={handleSlotsChange}
                onPhotoSelect={handlePhotoSelect}
                onPhotoRemove={handlePhotoRemove}
              />
            </div>

            {/* 備註 */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">備註</label>
              <textarea value={form.notes} rows={3} onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="補充說明..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

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

/* ── 簽名格 (與 MaintenanceList 內部元件相同,獨立一份避免相依) ── */

function SignatureSlot({ img, uploading, onSelect, onRemove }) {
  const fileRef = useRef(null)
  const hasImg = img && img.url

  return (
    <div
      className={`relative w-full h-16 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors ${
        hasImg ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50 cursor-pointer'
      }`}
      onClick={() => { if (!hasImg && !uploading) fileRef.current?.click() }}
    >
      {uploading ? (
        <span className="text-xs text-blue-500 animate-pulse">上傳中...</span>
      ) : hasImg ? (
        <>
          <img src={img.url} alt="簽名" className="h-full w-full object-contain p-1" />
          <button
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600 transition-colors"
          >✕</button>
        </>
      ) : (
        <span className="text-xs text-gray-400">點擊上傳簽名圖片</span>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) onSelect(e.target.files[0]); e.target.value = '' }} />
    </div>
  )
}
