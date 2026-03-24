/**
 * 維護表輸出工具 — PDF / 圖片
 * 版本: v1.0
 * 日期: 2026-03-23
 * 檔案: src/utils/exportMaintenance.js
 *
 * 使用 html2canvas 截圖 + jsPDF 產生 PDF
 * 解析度由 scale 參數控制：
 *   72 dpi → scale 1
 *   150 dpi → scale 2
 *   300 dpi → scale 3
 */

import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

/** DPI 對應 html2canvas scale */
const DPI_SCALE = {
  72: 1,
  150: 2,
  300: 3,
}

/**
 * 將 DOM 元素輸出為圖片或 PDF
 * @param {HTMLElement} element - 要擷取的 DOM 元素
 * @param {object} options
 * @param {'pdf'|'png'|'jpeg'} options.format - 輸出格式
 * @param {72|150|300} options.dpi - 解析度
 * @param {string} options.fileName - 檔名（不含副檔名）
 */
export async function exportMaintenance(element, { format = 'pdf', dpi = 150, fileName = '維護記錄' }) {
  const scale = DPI_SCALE[dpi] || 2

  // html2canvas 擷取
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#ffffff',
    logging: false,
  })

  if (format === 'png') {
    downloadDataURL(canvas.toDataURL('image/png'), `${fileName}.png`)
    return
  }

  if (format === 'jpeg') {
    downloadDataURL(canvas.toDataURL('image/jpeg', 0.92), `${fileName}.jpg`)
    return
  }

  // PDF：A4 直向
  const imgData = canvas.toDataURL('image/jpeg', 0.92)
  const pdf = new jsPDF('p', 'mm', 'a4')
  const pdfWidth = pdf.internal.pageSize.getWidth()
  const pdfHeight = pdf.internal.pageSize.getHeight()

  // 計算圖片在 PDF 中的尺寸（等比縮放，寬度填滿）
  const imgRatio = canvas.height / canvas.width
  const fitWidth = pdfWidth - 16  // 左右各留 8mm
  const fitHeight = fitWidth * imgRatio

  if (fitHeight <= pdfHeight - 16) {
    // 單頁放得下
    pdf.addImage(imgData, 'JPEG', 8, 8, fitWidth, fitHeight)
  } else {
    // 超過一頁：按頁高切割
    const pageImgHeight = (pdfHeight - 16) / fitWidth * canvas.width
    let yOffset = 0
    let pageNum = 0

    while (yOffset < canvas.height) {
      if (pageNum > 0) pdf.addPage()

      // 切割 canvas 成每頁的區段
      const sliceHeight = Math.min(pageImgHeight, canvas.height - yOffset)
      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = canvas.width
      pageCanvas.height = sliceHeight
      const ctx = pageCanvas.getContext('2d')
      ctx.drawImage(canvas, 0, yOffset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)

      const pageData = pageCanvas.toDataURL('image/jpeg', 0.92)
      const sliceRatio = sliceHeight / canvas.width
      const slicePdfHeight = fitWidth * sliceRatio
      pdf.addImage(pageData, 'JPEG', 8, 8, fitWidth, slicePdfHeight)

      yOffset += sliceHeight
      pageNum++
    }
  }

  pdf.save(`${fileName}.pdf`)
}

/** 觸發瀏覽器下載 */
function downloadDataURL(dataURL, fileName) {
  const link = document.createElement('a')
  link.download = fileName
  link.href = dataURL
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
