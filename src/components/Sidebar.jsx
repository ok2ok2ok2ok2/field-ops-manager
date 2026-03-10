/**
 * 收縮式側邊導航欄
 * 版本: v2.0
 * 日期: 2026-03-06
 * 檔案: src/components/Sidebar.jsx
 *
 * v2.0 重構：
 *  - 預設窄版 64px，只顯示 icon
 *  - hover 展開 220px（overlay 浮層，不推擠主內容）
 *  - 導航精簡為 3 項：工作總覽、客戶管理、設備管理
 */

import { useState } from 'react'
import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { path: '/',        label: '工作總覽', icon: '📋' },
  { path: '/clients', label: '客戶管理', icon: '👥' },
  { path: '/devices', label: '設備管理', icon: '📷' },
]

export default function Sidebar() {
  const [hovered, setHovered] = useState(false)

  return (
    <>
      {/* 佔位元素：固定 64px 讓 Layout 的 main 不會被蓋住 */}
      <div className="w-16 flex-shrink-0" />

      {/* 實際 sidebar：fixed 定位，hover 展開 */}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="fixed top-0 left-0 h-screen flex flex-col z-40 transition-all duration-200 ease-in-out"
        style={{
          width: hovered ? 220 : 64,
          backgroundColor: '#1a1a2e',
        }}
      >
        {/* Logo 區域 */}
        <div className="px-4 py-5 border-b border-white/10 flex items-center gap-3 overflow-hidden">
          <span className="text-xl flex-shrink-0">⚙️</span>
          <span
            className="text-white text-sm font-bold whitespace-nowrap transition-opacity duration-200"
            style={{ opacity: hovered ? 1 : 0 }}
          >
            工作管理系統
          </span>
        </div>

        {/* 導航列表 */}
        <nav className="flex-1 py-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 mx-2 rounded-lg text-sm transition-all duration-150 overflow-hidden ${
                  isActive
                    ? 'bg-blue-900/80 text-white font-medium'
                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <span className="text-lg flex-shrink-0 w-6 text-center">{item.icon}</span>
              <span
                className="whitespace-nowrap transition-opacity duration-200"
                style={{ opacity: hovered ? 1 : 0 }}
              >
                {item.label}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* 底部版本 */}
        <div className="px-4 py-3 border-t border-white/10 overflow-hidden">
          <p
            className="text-gray-500 text-xs whitespace-nowrap transition-opacity duration-200"
            style={{ opacity: hovered ? 1 : 0 }}
          >
            v2.0 · 2026-03-06
          </p>
        </div>
      </aside>
    </>
  )
}
