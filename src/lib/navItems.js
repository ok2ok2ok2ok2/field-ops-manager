/**
 * 導航項目定義
 * 版本: v1.0
 * 日期: 2026-08-24
 * 檔案: src/lib/navItems.js
 *
 * 從 Sidebar.jsx 抽出 — Sidebar 與 Layout 手機頂欄共用。
 * (元件檔不能同時匯出常數, 會壞掉 vite fast refresh)
 */

/* ── 外勤管理 ── */
export const FIELD_NAV_ITEMS = [
  { path: '/',                    label: '工作總覽',   icon: '📋' },
  { path: '/clients',             label: '客戶管理',   icon: '👥' },
  { path: '/devices',             label: '設備管理',   icon: '📷' },
  { path: '/maintenance',         label: '定期維護',   icon: '🔬' },
  { path: '/maintenance-adhoc',   label: '機動維護',   icon: '🛠️' },
  { path: '/repair-orders',       label: '送修單',     icon: '🔧' },
  { path: '/monthly-report',      label: '月報表',     icon: '📤' },
]

export const ADMIN_NAV_ITEMS = [
  { path: '/admin/users', label: '使用者管理', icon: '⚙️' },
]

/* ── 監控中心 ── */
export const MONITOR_NAV_ITEMS = [
  { path: '/monitor?page=server-daily',   label: '每日填寫',   icon: '📝' },
  { path: '/monitor?page=server-stats',   label: '統計報表',   icon: '📊' },
  { path: '/monitor?page=server-servers', label: '伺服器管理', icon: '🖥️' },
  { path: '/monitor?page=server-slopes',  label: '坡面管理',   icon: '⛰️' },
  { path: '/monitor?page=server-options', label: '選項設定',   icon: '🔘' },
  { path: '/monitor?page=server-alerts',  label: '提醒規則',   icon: '🔔' },
  { path: '/monitor?page=server-report',  label: '客戶報表',   icon: '📋' },
  { path: '/monitor?page=customers',      label: '客戶推播設定', icon: '📣' },
]

/* ── 獨立項目 ── */
export const STANDALONE_NAV_ITEMS = [
  { path: '/monitor?page=website-monitor', label: '站點警報', icon: '🚨' },
]

/* 給 Layout 手機頂欄查目前頁面標題用 */
export const ALL_NAV_ITEMS = [
  ...FIELD_NAV_ITEMS, ...ADMIN_NAV_ITEMS, ...MONITOR_NAV_ITEMS, ...STANDALONE_NAV_ITEMS,
]
