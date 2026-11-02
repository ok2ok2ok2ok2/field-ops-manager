/**
 * 工作總覽顯示開關 — 國定假日／公司行程要不要顯示
 * 版本: v1.0
 * 日期: 2026-11-02
 * 檔案: src/lib/displayPrefs.js
 *
 * 每台瀏覽器各自記（localStorage）。讀不到就預設全開。
 */

const KEY = 'fieldops.displayPrefs'
const DEFAULTS = { holidays: true, company: true }

export function loadDisplayPrefs() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (v && typeof v === 'object') return { ...DEFAULTS, ...v }
  } catch { /* 用預設 */ }
  return { ...DEFAULTS }
}

export function saveDisplayPrefs(prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)) } catch { /* 忽略 */ }
}
