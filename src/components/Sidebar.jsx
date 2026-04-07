/**
 * 收縮式側邊導航欄
 * 版本: v7.2
 * 日期: 2026-04-07
 * 檔案: src/components/Sidebar.jsx
 *
 * v7.2：隱藏導航區滾動條（保留滾動功能）
 * v7.1：站點警報移為獨立項目（與外勤管理/監控中心同層級）
 * v7.0：導航分群組（外勤管理 / 監控中心），各群組可收起/展開
 * v6.0：加入「送修單」導航項
 * v5.0：加入「維護記錄」導航項
 * v4.0：admin 顯示「使用者管理」導航項 + boss 角色標籤
 * v3.0：底部顯示使用者名稱 + 登出按鈕
 * v2.0：hover 展開 overlay
 */

import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

/* ── 外勤管理 ── */
const FIELD_NAV_ITEMS = [
  { path: '/',               label: '工作總覽',   icon: '📋' },
  { path: '/clients',        label: '客戶管理',   icon: '👥' },
  { path: '/devices',        label: '設備管理',   icon: '📷' },
  { path: '/maintenance',    label: '維護記錄',   icon: '🔬' },
  { path: '/repair-orders',  label: '送修單',     icon: '🔧' },
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
function GroupHeader({ label, icon, expanded, onToggle, hovered }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-3 px-4 py-2 mx-2 w-[calc(100%-16px)] rounded-lg text-xs text-gray-400 hover:text-gray-200 transition-colors"
    >
      <span className="text-sm flex-shrink-0 w-6 text-center">{icon}</span>
      <span
        className="whitespace-nowrap flex-1 text-left transition-opacity duration-200"
        style={{ opacity: hovered ? 1 : 0 }}
      >
        {label}
      </span>
      <span
        className="text-[10px] transition-all duration-200"
        style={{
          opacity: hovered ? 1 : 0,
          transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
        }}
      >
        ▼
      </span>
    </button>
  )
}

/* ── 導航項目元件 ── */
function NavItem({ item, hovered }) {
  const hasQuery = item.path.includes('?')

  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
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
        className="whitespace-nowrap transition-opacity duration-200"
        style={{ opacity: hovered ? 1 : 0 }}
      >
        {item.label}
      </span>
    </NavLink>
  )
}

/* ── 主元件 ── */
export default function Sidebar() {
  const [hovered, setHovered] = useState(false)
  const [fieldExpanded, setFieldExpanded] = useState(true)
  const [monitorExpanded, setMonitorExpanded] = useState(true)
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

  const displayName = profile?.display_name || '使用者'
  const role = profile?.role || 'user'
  const fieldItems = isAdmin ? [...FIELD_NAV_ITEMS, ...ADMIN_NAV_ITEMS] : FIELD_NAV_ITEMS

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
          width: hovered ? 220 : 64,
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

        {/* 導航區 - 可捲動、滾動條隱藏 */}
        <nav
          className="sidebar-nav flex-1 py-3 overflow-y-auto overflow-x-hidden"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {/* 外勤管理群組 */}
          <GroupHeader
            label="外勤管理"
            icon="🏗️"
            expanded={fieldExpanded}
            onToggle={() => setFieldExpanded(!fieldExpanded)}
            hovered={hovered}
          />
          {fieldExpanded && fieldItems.map((item) => (
            <NavItem key={item.path} item={item} hovered={hovered} />
          ))}

          {/* 分隔線 */}
          <div className="my-3 mx-4 border-t border-white/10" />

          {/* 監控中心群組 */}
          <GroupHeader
            label="監控中心"
            icon="📡"
            expanded={monitorExpanded}
            onToggle={() => setMonitorExpanded(!monitorExpanded)}
            hovered={hovered}
          />
          {monitorExpanded && MONITOR_NAV_ITEMS.map((item) => (
            <NavItem key={item.path} item={item} hovered={hovered} />
          ))}

          {/* 分隔線 */}
          <div className="my-3 mx-4 border-t border-white/10" />

          {/* 站點警報 — 獨立項目 */}
          {STANDALONE_NAV_ITEMS.map((item) => (
            <NavItem key={item.path} item={item} hovered={hovered} />
          ))}
        </nav>

        {/* 底部：使用者資訊 + 登出 */}
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
    </>
  )
}
