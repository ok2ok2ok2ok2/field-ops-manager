/**
 * 照片批次工具 — 一次選多張，自動依拍攝順序填進空格
 * 版本: v1.0
 * 日期: 2026-11-02
 * 檔案: src/lib/photoBatch.js
 *
 * assignFilesToSlots：純函式（node --test 驗收：scripts/photoBatch.test.mjs）
 * shrinkImage：瀏覽器端縮圖成 JPEG，手機原圖 4~10MB，13 張走 4G 會很久
 *
 * 報表的照片都是 objectFit: cover，所以批次上傳不必逐張裁切；
 * 要調整構圖時，單格仍可刪掉重拍走原本的裁切流程。
 */

/**
 * 把檔案依拍攝時間（lastModified）由舊到新，依序填進尚未有照片的格位。
 * @param {File[]|{lastModified:number}[]} files
 * @param {string[]} slotKeys  格位順序（畫面上由左到右、由上到下）
 * @param {Object} photos      現有 photos：{ [key]: { url } }
 * @returns {{ pairs: [string, File][], overflow: File[] }}
 *   pairs = [格位 key, 檔案]；overflow = 空格不夠時剩下的檔案
 */
export function assignFilesToSlots(files, slotKeys, photos = {}) {
  const sorted = [...files].sort((a, b) => (a.lastModified || 0) - (b.lastModified || 0))
  const empty = slotKeys.filter((k) => !photos[k]?.url)
  const pairs = []
  for (let i = 0; i < Math.min(sorted.length, empty.length); i++) {
    pairs.push([empty[i], sorted[i]])
  }
  return { pairs, overflow: sorted.slice(empty.length) }
}

/**
 * 縮圖：長邊超過 maxSide 才縮，輸出 JPEG。失敗就原檔照傳（不擋上傳）。
 * @param {File} file
 * @param {number} maxSide
 * @returns {Promise<File>}
 */
export async function shrinkImage(file, maxSide = 1920) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * scale)
    const h = Math.round(bmp.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h)
    bmp.close?.()
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
    if (!blob) return file
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  }
}
