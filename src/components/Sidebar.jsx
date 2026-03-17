/**
 * 收縮式側邊導航欄
 * 版本: v3.0
 * 日期: 2026-03-16
 * 檔案: src/components/Sidebar.jsx
 *
 * v3.0：底部顯示使用者名稱 + 登出按鈕
 * v2.0：hover 展開 overlay
 */

import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

const NAV_ITEMS = [
  { path: '/',        label: '工作總覽', icon: '📋' },
  { path: '/clients', label: '客戶管理', icon: '👥' },
  { path: '/devices', label: '設備管理', icon: '📷' },
]

export default function Sidebar() {
  const [hovered, setHovered] = useState(false)
  const { profile, signOut } = useAuth()
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
  const isAdmin = profile?.role === 'admin'

  return (
    <>
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

        {/* 導航 */}
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

        {/* 底部：使用者資訊 + 登出 */}
        <div className="px-3 py-3 border-t border-white/10 overflow-hidden">
          <div className="flex items-center gap-3 px-1">
            {/* 頭像圓圈 */}
            <div className="w-8 h-8 flex-shrink-0 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
              {displayName.charAt(0)}
            </div>
            <div
              className="flex-1 min-w-0 transition-opacity duration-200"
              style={{ opacity: hovered ? 1 : 0 }}
            >
              <p className="text-white text-sm font-medium truncate">{displayName}</p>
              <p className="text-gray-500 text-xs">
                {isAdmin ? '管理員' : '使用者'}
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
