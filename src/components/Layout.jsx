/**
 * 主佈局元件
 * 版本: v2.0
 * 日期: 2026-03-06
 * 檔案: src/components/Layout.jsx
 *
 * v2.0 重構：
 *  - 配合收縮式 Sidebar（固定 64px 佔位 + overlay 展開）
 *  - main 區域 flex-1 不受 sidebar hover 影響
 */

import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#f0f2f5' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
