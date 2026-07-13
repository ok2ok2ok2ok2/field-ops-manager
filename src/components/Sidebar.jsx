/**
 * 收縮式側邊導航欄
 * 版本: v7.3
 * 日期: 2026-07-13
 * 檔案: src/components/Sidebar.jsx
 *
 * v7.3：常用功能群組 (釘選+7天點擊 top-N) / 兩群組預設收起 + localStorage persist / 加 /monthly-report
 * v7.2：隱藏導航區滾動條（保留滾動功能）
 * v7.1：站點警報移為獨立項目（與外勤管理/監控中心同層級）
 * v7.0：導航分群組（外勤管理 / 監控中心），各群組可收起/展開
 */

import { useEffect, useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  getPrefs, setCollapsed, recordClick, togglePin, isPinned,
  getFavorites, clearClickHistory, savePrefs, CONSTANTS,
} from '../lib/sidebarPrefs'

/* ── 外勤管理 ── */
const FIELD_NAV_ITEMS = [
  { path: '/',                    label: '工作總覽',   icon: '📋' },
  { path: '/clients',             label: '客戶管理',   icon: '👥' },
  { path: '/devices',             label: '設備管理',   icon: '📷' },
  { path: '/maintenance',         label: '定期維護',   icon: '🔬' },
  { path: '/maintenance-adhoc',   label: '機動維護',   icon: '🛠️' },
  { path: '/repair-orders',       label: '送修單',     icon: '🔧' },
  { path: '/monthly-report',      label: '月報表',     icon: '📤' },
]

const ADMIN_NAV_ITEMS = [
  { path: '/admin/users', label: '使用者管理', icon: '⚙️' },
]

/* ── 監控中心 ── */
const MONITOR_NAV_ITEMS = [
  { path: '/monitor?page=server-daily',   label: '每日填寫',   icon: '📝' },
  { path: '/monitor?page=server-stats',   label: '統計報表',   icon: '📊' },
  { path: '/monitor?page=server-servers', label: '伺服器管理', icon: '🖥️' },
  { path: '/monitor?page=server-slopes',  label: '坡面管理',   icon: '⛰️' },
  { path: '/monitor?page=server-options', label: '選項設定',   icon: '🔘' },
  { path: '/monitor?page=server-alerts',  label: '提醒規則',   icon: '🔔' },
  { path: '/monitor?page=server-report',  label: '客戶報表',   icon: '📋' },
]

/* ── 獨立項目 ── */
const STANDALONE_NAV_ITEMS = [
  { path: '/monitor?page=website-monitor', label: '站點警報', icon: '🚨' },
]

const ROLE_LABEL = {
  admin: '管理員',
  boss: '主管',
  user: '使用者',
}

/* ── 群組標題元件 ── */
function GroupHeader({ label, icon, expanded, onToggle, hovered, hideToggle }) {
  return (
    <button
      onClick={hideToggle ? undefined : onToggle}
      className="flex items-center gap-3 px-4 py-2 mx-2 w-[calc(100%-16px)] rounded-lg text-xs text-gray-400 hover:text-gray-200 transition-colors"
      style={{ cursor: hideToggle ? 'default' : 'pointer' }}
    >
      <span className="text-sm flex-shrink-0 w-6 text-center">{icon}</span>
      <span
        className="whitespace-nowrap flex-1 text-left transition-opacity duration-200"
        style={{ opacity: hovered ? 1 : 0 }}
      >
        {label}
      </span>
      {!hideToggle && (
        <span
          className="text-[10px] transition-all duration-200"
          style={{
            opacity: hovered ? 1 : 0,
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}
        >
          ▼
        </span>
      )}
    </button>
  )
}

/* ── 導航項目元件 ── */
function NavItem({ item, hovered, showPin, pinned, onTogglePin }) {
  const hasQuery = item.path.includes('?')

  return (
    <div className="relative group">
      <NavLink
        to={item.path}
        end={item.path === '/'}
        onClick={() => recordClick(item.path)}
        className={({ isActive }) => {
          let active = isActive
          if (hasQuery) {
            active = window.location.pathname + window.location.search === item.path
          }
          return `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-all duration-150 overflow-hidden ${
            active
              ? 'bg-blue-900/80 text-white font-medium'
              : 'text-gray-300 hover:bg-white/5 hover:text-white'
          }`
        }}
      >
        <span className="text-lg flex-shrink-0 w-6 text-center">{item.icon}</span>
        <span
          className="whitespace-nowrap flex-1 transition-opacity duration-200"
          style={{ opacity: hovered ? 1 : 0 }}
        >
          {item.label}
        </span>
        {showPin && hovered && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePin(item.path) }}
            className="text-xs text-gray-500 hover:text-yellow-400 flex-shrink-0"
            title={pinned ? '取消釘選' : '釘選到常用'}
          >
            {pinned ? '★' : '☆'}
          </button>
        )}
      </NavLink>
    </div>
  )
}

/* ── 設定 modal ── */
function SettingsModal({ open, onClose, maxFavs, onChangeMax, onClearHistory, pinnedItems, allItems, onTogglePin }) {
  if (!open) return null
  const pinnedNavItems = pinnedItems
    .map((path) => allItems.find((it) => it.path === path))
    .filter(Boolean)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-96 max-w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-4">常用功能設定</h3>

        <div className="mb-4">
          <label className="text-sm block mb-1">顯示上限 ({CONSTANTS.MIN_FAVS}–{CONSTANTS.MAX_FAVS}):</label>
          <input
            type="number" min={CONSTANTS.MIN_FAVS} max={CONSTANTS.MAX_FAVS}
            value={maxFavs}
            onChange={(e) => onChangeMax(Number(e.target.value))}
            className="border rounded px-2 py-1 w-20"
          />
        </div>

        <div className="mb-4">
          <div className="text-sm mb-2">當前釘選 ({pinnedNavItems.length}):</div>
          {pinnedNavItems.length === 0 && (
            <div className="text-xs text-gray-400">尚未釘選任何項目 (hover 側邊欄項目按 ☆ 釘選)</div>
          )}
          <ul className="text-sm space-y-1">
            {pinnedNavItems.map((it) => (
              <li key={it.path} className="flex items-center gap-2 border rounded px-2 py-1">
                <span>{it.icon}</span>
                <span className="flex-1">{it.label}</span>
                <button onClick={() => onTogglePin(it.path)} className="text-red-500 text-xs">移除</button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mb-4">
          <button
            onClick={onClearHistory}
            className="text-sm text-red-600 border border-red-300 rounded px-3 py-1 hover:bg-red-50"
          >
            清除點擊歷史
          </button>
          <p className="text-xs text-gray-500 mt-1">釘選不會被清除,自動排序歸零</p>
        </div>

        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-1 bg-gray-200 rounded hover:bg-gray-300">關閉</button>
        </div>
      </div>
    </div>
  )
}

/* ── 主元件 ── */
export default function Sidebar() {
  const [hovered, setHovered] = useState(false)
  const initialPrefs = useMemo(() => getPrefs(), [])
  const [fieldExpanded, setFieldExpanded] = useState(!initialPrefs.collapsed.field)
  const [monitorExpanded, setMonitorExpanded] = useState(!initialPrefs.collapsed.monitor)
  const [prefsVer, setPrefsVer] = useState(0)  // 觸發重新讀 prefs
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch (err) {
      toast.error('登出失敗：' + err.message)
    }
  }

  function handleToggleField() {
    const next = !fieldExpanded
    setFieldExpanded(next)
    setCollapsed('field', !next)
  }
  function handleToggleMonitor() {
    const next = !monitorExpanded
    setMonitorExpanded(next)
    setCollapsed('monitor', !next)
  }

  function handleTogglePin(path) {
    togglePin(path)
    setPrefsVer((v) => v + 1)
  }

  function handleChangeMax(n) {
    savePrefs({ maxFavs: Math.max(CONSTANTS.MIN_FAVS, Math.min(CONSTANTS.MAX_FAVS, n)) })
    setPrefsVer((v) => v + 1)
  }

  function handleClearHistory() {
    clearClickHistory()
    setPrefsVer((v) => v + 1)
    toast.success('點擊歷史已清除')
  }

  const displayName = profile?.display_name || '使用者'
  const role = profile?.role || 'user'
  const fieldItems = isAdmin ? [...FIELD_NAV_ITEMS, ...ADMIN_NAV_ITEMS] : FIELD_NAV_ITEMS

  const allItems = useMemo(
    () => [...fieldItems, ...MONITOR_NAV_ITEMS, ...STANDALONE_NAV_ITEMS],
    [fieldItems]
  )

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const favorites = useMemo(() => getFavorites(allItems), [allItems, prefsVer])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const currentPrefs = useMemo(() => getPrefs(), [prefsVer])

  return (
    <>
      {/* 隱藏 sidebar nav 滾動條 */}
      <style>{`.sidebar-nav::-webkit-scrollbar { display: none; }`}</style>

      {/* 佔位元素 */}
      <div className="w-16 flex-shrink-0" />

      {/* 實際 sidebar */}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="fixed top-0 left-0 h-screen flex flex-col z-40 transition-all duration-200 ease-in-out"
        style={{
          width: hovered ? 240 : 64,
          backgroundColor: '#1a1a2e',
        }}
      >
        {/* Logo */}
        <div className="px-4 py-5 border-b border-white/10 flex items-center gap-3 overflow-hidden">
          <span className="text-xl flex-shrink-0">⚙️</span>
          <span
            className="text-white text-sm font-bold whitespace-nowrap transition-opacity duration-200"
            style={{ opacity: hovered ? 1 : 0 }}
          >
            工作管理系統
          </span>
        </div>

        {/* 導航區 */}
        <nav
          className="sidebar-nav flex-1 py-3 overflow-y-auto overflow-x-hidden"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {/* 常用功能群組 (永遠展開, 顯示上限 currentPrefs.maxFavs) */}
          {favorites.length > 0 && (
            <>
              <GroupHeader label="常用功能" icon="⭐" expanded hovered={hovered} hideToggle />
              {favorites.map((item) => (
                <NavItem
                  key={`fav-${item.path}`}
                  item={item}
                  hovered={hovered}
                  showPin
                  pinned={isPinned(item.path)}
                  onTogglePin={handleTogglePin}
                />
              ))}
              <div className="my-3 mx-4 border-t border-white/10" />
            </>
          )}

          {/* 外勤管理群組 */}
          <GroupHeader
            label="外勤管理"
            icon="🏗️"
            expanded={fieldExpanded}
            onToggle={handleToggleField}
            hovered={hovered}
          />
          {fieldExpanded && fieldItems.map((item) => (
            <NavItem
              key={item.path}
              item={item}
              hovered={hovered}
              showPin
              pinned={isPinned(item.path)}
              onTogglePin={handleTogglePin}
            />
          ))}

          {/* 分隔線 */}
          <div className="my-3 mx-4 border-t border-white/10" />

          {/* 監控中心群組 */}
          <GroupHeader
            label="監控中心"
            icon="📡"
            expanded={monitorExpanded}
            onToggle={handleToggleMonitor}
            hovered={hovered}
          />
          {monitorExpanded && MONITOR_NAV_ITEMS.map((item) => (
            <NavItem
              key={item.path}
              item={item}
              hovered={hovered}
              showPin
              pinned={isPinned(item.path)}
              onTogglePin={handleTogglePin}
            />
          ))}

          {/* 分隔線 */}
          <div className="my-3 mx-4 border-t border-white/10" />

          {/* 站點警報 — 獨立項目 */}
          {STANDALONE_NAV_ITEMS.map((item) => (
            <NavItem
              key={item.path}
              item={item}
              hovered={hovered}
              showPin
              pinned={isPinned(item.path)}
              onTogglePin={handleTogglePin}
            />
          ))}
        </nav>

        {/* 底部：使用者資訊 + 設定 + 登出 */}
        <div className="px-3 py-3 border-t border-white/10 overflow-hidden">
          <div className="flex items-center gap-3 px-1">
            <div className="w-8 h-8 flex-shrink-0 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
              {displayName.charAt(0)}
            </div>
            <div
              className="flex-1 min-w-0 transition-opacity duration-200"
              style={{ opacity: hovered ? 1 : 0 }}
            >
              <p className="text-white text-sm font-medium truncate">{displayName}</p>
              <p className="text-gray-500 text-xs">
                {ROLE_LABEL[role] || '使用者'}
              </p>
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex-shrink-0 text-gray-400 hover:text-white transition-colors text-sm"
              style={{ opacity: hovered ? 1 : 0 }}
              title="常用功能設定"
            >
              ⚙
            </button>
            <button
              onClick={handleSignOut}
              className="flex-shrink-0 text-gray-400 hover:text-red-400 transition-colors text-sm"
              style={{ opacity: hovered ? 1 : 0 }}
              title="登出"
            >
              ⏻
            </button>
          </div>
        </div>
      </aside>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        maxFavs={currentPrefs.maxFavs}
        onChangeMax={handleChangeMax}
        onClearHistory={handleClearHistory}
        pinnedItems={currentPrefs.pinned}
        allItems={allItems}
        onTogglePin={handleTogglePin}
      />
    </>
  )
}
