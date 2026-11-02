/**
 * 輸出設定記憶 — 格式／解析度記住上次的選擇
 * 版本: v1.0
 * 日期: 2026-11-02
 * 檔案: src/lib/exportPrefs.js
 *
 * 存 localStorage（per 瀏覽器）。無痕或被擋時回預設值，不影響輸出。
 */

const KEY = 'fieldops.exportPrefs'
const DEFAULTS = { format: 'pdf', dpi: 150 }

export function loadExportPrefs() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (v && ['pdf', 'png', 'jpeg'].includes(v.format) && [72, 150, 300].includes(v.dpi)) return v
  } catch { /* 讀不到就用預設 */ }
  return { ...DEFAULTS }
}

export function saveExportPrefs(prefs) {
  try { localStorage.setItem(KEY, JSON.stringify({ format: prefs.format, dpi: prefs.dpi })) } catch { /* 忽略 */ }
}
