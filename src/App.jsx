/**
 * App 主入口 — 路由設定
 * 版本: v3.0
 * 日期: 2026-03-16
 * 檔案: src/App.jsx
 *
 * v3.0：加入 AuthProvider + Login 路由 + ProtectedRoute
 * v2.0：首頁改為 WorkDashboard
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import WorkDashboard from './pages/WorkDashboard'
import ClientList from './pages/ClientList'
import DeviceList from './pages/DeviceList'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 2500,
            style: { fontSize: '14px' },
          }}
        />
        <Routes>
          {/* 登入頁（不受 ProtectedRoute 保護） */}
          <Route path="/login" element={<Login />} />

          {/* 受保護路由（需登入） */}
          <Route element={<ProtectedRoute />}>
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
          </Route>

          {/* 其他路由 → 首頁 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
