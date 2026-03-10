/**
 * App 主入口 — 路由設定
 * 版本: v2.0
 * 日期: 2026-03-10
 * 檔案: src/App.jsx
 *
 * v2.0 重構：
 *  - 首頁改為 WorkDashboard（三合一）
 *  - 移除 /kanban、/daily-log、/tasks、/dashboard 舊路由
 *  - 保留 /clients、/devices
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Layout'
import WorkDashboard from './pages/WorkDashboard'
import ClientList from './pages/ClientList'
import DeviceList from './pages/DeviceList'

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 2500,
          style: { fontSize: '14px' },
        }}
      />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<WorkDashboard />} />
          <Route path="/clients" element={<ClientList />} />
          <Route path="/devices" element={<DeviceList />} />
          {/* 舊路由重導 */}
          <Route path="/kanban" element={<Navigate to="/" replace />} />
          <Route path="/daily-log" element={<Navigate to="/" replace />} />
          <Route path="/tasks" element={<Navigate to="/" replace />} />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
