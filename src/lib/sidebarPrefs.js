/**
 * 側邊欄使用者偏好 — 收合狀態 / 點擊追蹤 / 釘選 / 上限
 * 版本: v1.0
 * 日期: 2026-07-13
 * 檔案: src/lib/sidebarPrefs.js
 *
 * 純 localStorage, 不動 IndexedDB / Dexie
 */

const STORAGE_KEY = 'sidebar_prefs_v1'
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000  // 7 天
const DEFAULT_MAX_FAVS = 4
const MIN_FAVS = 2
const MAX_FAVS = 6

const DEFAULTS = {
  collapsed: { field: true, monitor: true },
  pinned: [],
  clicks: {},
  maxFavs: DEFAULT_MAX_FAVS,
}

/* ========== 基礎 read / write ========== */

export function getPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw)
    return {
      collapsed: { ...DEFAULTS.collapsed, ...(parsed.collapsed || {}) },
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
      clicks: parsed.clicks && typeof parsed.clicks === 'object' ? parsed.clicks : {},
      maxFavs: clampMaxFavs(parsed.maxFavs),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function writePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch (e) {
    console.warn('[sidebarPrefs] 儲存失敗', e)
  }
}

export function savePrefs(patch) {
  const current = getPrefs()
  const next = { ...current, ...patch }
  writePrefs(next)
  return next
}

function clampMaxFavs(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return DEFAULT_MAX_FAVS
  return Math.max(MIN_FAVS, Math.min(MAX_FAVS, Math.round(n)))
}

/* ========== 收合狀態 ========== */

export function setCollapsed(key, collapsed) {
  const prefs = getPrefs()
  prefs.collapsed[key] = !!collapsed
  writePrefs(prefs)
}

/* ========== 點擊追蹤 ========== */

export function recordClick(path) {
  if (!path) return
  const prefs = getPrefs()
  const now = Date.now()
  const arr = Array.isArray(prefs.clicks[path]) ? prefs.clicks[path] : []
  arr.push(now)
  // 清理過期 (7 天前) — 同時對其他 path 也清一輪, 避免無限膨脹
  const cutoff = now - WINDOW_MS
  const cleaned = {}
  for (const [p, ts] of Object.entries(prefs.clicks)) {
    if (!Array.isArray(ts)) continue
    const kept = p === path ? arr.filter((t) => t > cutoff) : ts.filter((t) => t > cutoff)
    if (kept.length > 0) cleaned[p] = kept
  }
  if (!cleaned[path]) cleaned[path] = [now]
  prefs.clicks = cleaned
  writePrefs(prefs)
}

export function clearClickHistory() {
  const prefs = getPrefs()
  prefs.clicks = {}
  writePrefs(prefs)
}

export function getTopUsed(excludePaths, n) {
  const prefs = getPrefs()
  const cutoff = Date.now() - WINDOW_MS
  const exclude = new Set(excludePaths || [])
  const counts = []
  for (const [path, ts] of Object.entries(prefs.clicks)) {
    if (exclude.has(path)) continue
    if (!Array.isArray(ts)) continue
    const count = ts.filter((t) => t > cutoff).length
    if (count > 0) counts.push({ path, count })
  }
  counts.sort((a, b) => b.count - a.count)
  return counts.slice(0, n).map((c) => c.path)
}

/* ========== 釘選 ========== */

export function getPinned() {
  return getPrefs().pinned
}

export function togglePin(path) {
  const prefs = getPrefs()
  const idx = prefs.pinned.indexOf(path)
  if (idx >= 0) prefs.pinned.splice(idx, 1)
  else prefs.pinned.push(path)
  writePrefs(prefs)
  return prefs.pinned
}

export function isPinned(path) {
  return getPrefs().pinned.includes(path)
}

/* ========== 常用清單合成 ========== */

/**
 * @param {Array} allItems - 全部可選 NavItem [{path, label, icon}]
 * @param {number} [maxFavs] - 覆寫上限
 * @returns {Array} 顯示用 NavItem 陣列 (照順序: pinned 先, 未 pinned 中 top-clicks 補)
 */
export function getFavorites(allItems, maxFavs) {
  const prefs = getPrefs()
  const limit = clampMaxFavs(maxFavs ?? prefs.maxFavs)
  const byPath = new Map(allItems.map((it) => [it.path, it]))

  const result = []
  const seen = new Set()

  // 1. pinned 依照使用者釘選順序
  for (const path of prefs.pinned) {
    if (result.length >= limit) break
    if (seen.has(path)) continue
    const item = byPath.get(path)
    if (item) { result.push(item); seen.add(path) }
  }

  // 2. 未 pinned 中 top-clicks 補到滿
  if (result.length < limit) {
    const topPaths = getTopUsed(Array.from(seen), limit - result.length)
    for (const path of topPaths) {
      if (result.length >= limit) break
      if (seen.has(path)) continue
      const item = byPath.get(path)
      if (item) { result.push(item); seen.add(path) }
    }
  }

  return result
}

/* ========== 常數對外 ========== */
export const CONSTANTS = {
  MIN_FAVS,
  MAX_FAVS,
  DEFAULT_MAX_FAVS,
  WINDOW_MS,
}
