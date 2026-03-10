/**
 * 主佈局元件
 * 版本: v2.1 — 加入 SyncStatus
 * 日期: 2026-03-10
 * 檔案: src/components/Layout.jsx
 */

import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import SyncStatus from './SyncStatus'

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#f0f2f5' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
      <SyncStatus />
    </div>
  )
}