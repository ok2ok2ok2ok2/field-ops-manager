/**
 * 圖片裁切對話框
 * 版本: v1.0
 * 日期: 2026-03-23
 * 檔案: src/components/ImageCropper.jsx
 *
 * 使用 react-easy-crop，自由比例裁切
 * Props:
 *  - imageFile: File 物件
 *  - onConfirm(croppedFile): 裁切完成，回傳 File
 *  - onCancel(): 取消
 */

import { useState, useCallback, useEffect } from 'react'
import Cropper from 'react-easy-crop'

/**
 * 從 canvas 取得裁切後的 Blob
 */
function getCroppedBlob(imageSrc, pixelCrop) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = pixelCrop.width
      canvas.height = pixelCrop.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(
        img,
        pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
        0, 0, pixelCrop.width, pixelCrop.height
      )
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('裁切失敗'))
      }, 'image/jpeg', 0.92)
    }
    img.onerror = () => reject(new Error('圖片載入失敗'))
    img.src = imageSrc
  })
}

export default function ImageCropper({ imageFile, onConfirm, onCancel }) {
  const [imageSrc, setImageSrc] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [processing, setProcessing] = useState(false)

  // 讀取 File 為 dataURL
  useEffect(() => {
    if (!imageFile) return
    const reader = new FileReader()
    reader.onload = () => setImageSrc(reader.result)
    reader.readAsDataURL(imageFile)
  }, [imageFile])

  const onCropComplete = useCallback((_croppedArea, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  async function handleConfirm() {
    if (!imageSrc || !croppedAreaPixels) return
    setProcessing(true)
    try {
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels)
      const ext = imageFile.name.split('.').pop() || 'jpg'
      const fileName = imageFile.name.replace(/\.[^.]+$/, '') + '_cropped.' + ext
      const file = new File([blob], fileName, { type: 'image/jpeg' })
      onConfirm(file)
    } catch (err) {
      console.error('裁切錯誤:', err)
    }
    setProcessing(false)
  }

  if (!imageSrc) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative text-white text-sm animate-pulse">載入圖片中...</div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col">
      <div className="absolute inset-0 bg-black/80" />

      {/* 裁切區域 */}
      <div className="relative flex-1">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          showGrid={true}
        />
      </div>

      {/* 底部操作列 */}
      <div className="relative bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">縮放</span>
          <input type="range" min={1} max={3} step={0.1} value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-32 accent-blue-500" />
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors">
            取消
          </button>
          <button onClick={handleConfirm} disabled={processing}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {processing ? '處理中...' : '確認裁切'}
          </button>
        </div>
      </div>
    </div>
  )
}
