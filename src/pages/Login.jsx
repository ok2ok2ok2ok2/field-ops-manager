/**
 * 登入頁面
 * 版本: v1.0
 * 日期: 2026-03-16
 * 檔案: src/pages/Login.jsx
 */

import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Navigate } from 'react-router-dom'

export default function Login() {
  const { user, loading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 已登入 → 導回首頁
  if (!loading && user) return <Navigate to="/" replace />

  // 載入中
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f0f2f5' }}>
        <p className="text-gray-400">載入中...</p>
      </div>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim() || !password) { setError('請輸入帳號和密碼'); return }

    setError('')
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      const msg = err.message || '登入失敗'
      if (msg.includes('Invalid login credentials')) {
        setError('帳號或密碼錯誤')
      } else {
        setError(msg)
      }
    }
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1a1a2e' }}>
      <div className="w-full max-w-sm mx-4">

        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-4xl">⚙️</span>
          <h1 className="text-white text-xl font-bold mt-3">外勤工作管理系統</h1>
          <p className="text-gray-400 text-sm mt-1">請登入以繼續</p>
        </div>

        {/* 表單 */}
        <div className="bg-white rounded-2xl shadow-2xl p-6">
          {error && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit(e)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="請輸入密碼"
                autoComplete="current-password"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit(e)}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? '登入中...' : '登入'}
            </button>
          </div>
        </div>

        <p className="text-center text-gray-500 text-xs mt-6">
          帳號由管理員建立，如需帳號請聯繫管理員
        </p>
      </div>
    </div>
  )
}
