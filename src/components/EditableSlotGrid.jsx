/**
 * 機動維護版照片區 — 可自訂格位數量/名稱/大小
 * 版本: v1.0
 * 日期: 2026-06-26
 * 檔案: src/components/EditableSlotGrid.jsx
 *
 * 行為:
 *  - 4 欄 CSS Grid (auto-flow dense)，每格 grid-column: span cols (1..4)
 *  - re-resizable 包覆: 右邊 snap 到 col 邊界、下邊自由 (10px snap)
 *  - inline 編輯 label (input)，右上角 ✕ 刪格
 *  - 容器尾巴「＋新增格子」append 預設 slot
 *
 * Props:
 *  - slots: [{ id, label, cols, height }]
 *  - photos: { [slotId]: { url, name } }
 *  - uploading: 目前上傳中的 slotId 或 null
 *  - onSlotsChange(newSlots)
 *  - onPhotoSelect(slotId, file)
 *  - onPhotoRemove(slotId)
 */

import { useRef } from 'react'
import { Resizable } from 're-resizable'

const DEFAULT_SLOT = () => ({
  id: crypto.randomUUID(),
  label: '未命名',
  cols: 1,
  height: 180,
})

const MIN_HEIGHT = 80
const MAX_HEIGHT = 600

export default function EditableSlotGrid({
  slots, photos, uploading, onSlotsChange, onPhotoSelect, onPhotoRemove,
}) {
  function updateSlot(id, patch) {
    onSlotsChange(slots.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function removeSlot(id) {
    if (!window.confirm('確定刪除此照片格?')) return
    if (photos[id]?.url) onPhotoRemove(id)
    onSlotsChange(slots.filter((s) => s.id !== id))
  }

  function addSlot() {
    onSlotsChange([...slots, DEFAULT_SLOT()])
  }

  return (
    <div>
      <div
        className="grid grid-cols-4 gap-3"
        style={{ gridAutoFlow: 'dense', gridAutoRows: 'min-content' }}
      >
        {slots.map((slot) => (
          <EditableSlot
            key={slot.id}
            slot={slot}
            photo={photos[slot.id]}
            uploading={uploading === slot.id}
            onLabelChange={(label) => updateSlot(slot.id, { label })}
            onResize={(cols, height) => updateSlot(slot.id, { cols, height })}
            onRemoveSlot={() => removeSlot(slot.id)}
            onPhotoSelect={(file) => onPhotoSelect(slot.id, file)}
            onPhotoRemove={() => onPhotoRemove(slot.id)}
          />
        ))}
      </div>

      <button
        onClick={addSlot}
        className="mt-3 w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-colors"
      >
        ＋ 新增照片格
      </button>
    </div>
  )
}

/* ── 單一可調整格 ── */

function EditableSlot({
  slot, photo, uploading,
  onLabelChange, onResize, onRemoveSlot, onPhotoSelect, onPhotoRemove,
}) {
  const fileRef = useRef(null)
  const hasPhoto = photo && photo.url

  return (
    <div
      style={{ gridColumn: `span ${slot.cols}` }}
      className="flex flex-col"
    >
      {/* Label + 刪除 */}
      <div className="flex items-center gap-1 mb-1">
        <input
          type="text"
          value={slot.label}
          onChange={(e) => onLabelChange(e.target.value)}
          className="flex-1 text-xs px-1.5 py-0.5 border border-transparent hover:border-gray-200 rounded focus:border-blue-300 focus:outline-none text-gray-600 bg-transparent"
        />
        <button
          onClick={onRemoveSlot}
          className="text-gray-300 hover:text-red-500 text-xs px-1 transition-colors"
          title="刪除此格"
        >✕</button>
      </div>

      {/* 可調整高度 (寬度由下方 1/2/3/4 按鈕控) */}
      <Resizable
        size={{ width: '100%', height: slot.height }}
        minHeight={MIN_HEIGHT}
        maxHeight={MAX_HEIGHT}
        enable={{ bottom: true }}
        grid={[1, 10]}
        onResizeStop={(_e, _dir, ref) => {
          const newHeight = parseInt(ref.style.height, 10) || slot.height
          onResize(slot.cols, newHeight)
        }}
        handleStyles={{
          bottom: { height: '8px', bottom: '-4px', cursor: 'ns-resize', backgroundColor: 'transparent' },
        }}
        handleClasses={{
          bottom: 'hover:bg-blue-200/50',
        }}
      >
        <div
          className={`relative w-full h-full rounded-lg border-2 border-dashed overflow-hidden transition-colors ${
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
                onClick={(e) => { e.stopPropagation(); onPhotoRemove() }}
                className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600 transition-colors"
              >✕</button>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl text-gray-300">📷</span>
              <span className="text-xs text-gray-400 mt-1">點擊上傳</span>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) onPhotoSelect(e.target.files[0]); e.target.value = '' }} />
        </div>
      </Resizable>

      {/* 寬度切換 (1/2/3/4 格) */}
      <div className="flex justify-center gap-1 mt-1">
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            onClick={() => onResize(n, slot.height)}
            className={`text-[10px] w-5 h-5 rounded transition-colors ${
              slot.cols === n
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            title={`寬度 ${n} 格`}
          >{n}</button>
        ))}
      </div>
    </div>
  )
}
