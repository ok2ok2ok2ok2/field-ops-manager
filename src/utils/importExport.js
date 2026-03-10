/**
 * 匯入匯出共用工具
 * 版本: v1.0
 * 日期: 2025-03-04
 * 檔案: src/utils/importExport.js
 *
 * 依賴: xlsx (SheetJS)
 * 安裝: npm install xlsx
 *
 * 功能：
 *  - exportToFile(data, columns, filename, format)  匯出
 *  - parseImportFile(file)                          匯入解析
 */

import * as XLSX from 'xlsx'

/**
 * 匯出資料到檔案
 * @param {Array} data       - 資料陣列
 * @param {Array} columns    - 欄位對照 [{ header: '顯示名', key: 'data_key' }, ...]
 * @param {string} filename  - 檔名（不含副檔名）
 * @param {'csv'|'xlsx'} format - 格式
 */
export function exportToFile(data, columns, filename, format = 'xlsx') {
  // 轉成 SheetJS 需要的陣列格式（第一行是表頭）
  const headers = columns.map((c) => c.header)
  const rows = data.map((item) =>
    columns.map((c) => {
      const val = typeof c.transform === 'function' ? c.transform(item) : item[c.key]
      return val ?? ''
    })
  )

  const wsData = [headers, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // 自動欄寬
  ws['!cols'] = headers.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...rows.map((r) => String(r[i] || '').length)
    )
    return { wch: Math.min(Math.max(maxLen + 2, 8), 40) }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')

  if (format === 'csv') {
    XLSX.writeFile(wb, `${filename}.csv`, { bookType: 'csv' })
  } else {
    XLSX.writeFile(wb, `${filename}.xlsx`, { bookType: 'xlsx' })
  }
}

/**
 * 解析匯入檔案（CSV 或 XLSX）
 * @param {File} file - 檔案物件
 * @returns {Promise<Array<Object>>} 解析後的物件陣列（key 為第一行表頭）
 */
export function parseImportFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json(ws, { defval: '' })
        resolve(jsonData)
      } catch (err) {
        reject(new Error('檔案解析失敗：' + err.message))
      }
    }

    reader.onerror = () => reject(new Error('檔案讀取失敗'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * 將匯入的中文表頭資料轉成 DB 格式
 * @param {Array<Object>} rows       - parseImportFile 回傳的資料
 * @param {Array} columns            - 欄位對照（同 export 用的 columns）
 * @returns {Array<Object>}          - 轉換後的物件陣列（key 為 DB 欄位名）
 */
export function mapImportData(rows, columns) {
  const headerToKey = {}
  for (const col of columns) {
    headerToKey[col.header] = col
  }

  return rows.map((row) => {
    const mapped = {}
    for (const [header, value] of Object.entries(row)) {
      const col = headerToKey[header]
      if (col) {
        mapped[col.key] = typeof col.reverseTransform === 'function'
          ? col.reverseTransform(value)
          : value || null
      }
    }
    return mapped
  })
}
