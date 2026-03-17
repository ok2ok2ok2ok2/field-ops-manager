/**
 * 路由守衛 — 未登入導向 /login
 * 版本: v1.0
 * 日期: 2026-03-16
 * 檔案: src/components/ProtectedRoute.jsx
 */

import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: '#f0f2f5' }}>
        <p className="text-gray-400">驗證中...</p>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return <Outlet />
}
