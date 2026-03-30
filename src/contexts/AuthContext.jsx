/**
 * Auth 狀態管理
 * 版本: v1.7
 * 日期: 2026-03-25
 * 檔案: src/contexts/AuthContext.jsx
 *
 * v1.7：clearLocalDatabase 加 repair_orders
 * v1.6：新增 refreshProfile()（P10 案件可見性設定後重新載入 profile）
 * v1.5：新增 isBoss / canViewAll（boss+admin 可檢視全員私人資料）
 * v1.4：分離 auth 偵測和 profile 載入
 */

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import db from '../lib/offlineDb'
import { fullSync } from '../lib/syncManager'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined)   // undefined=還沒偵測, null=無登入, object=已登入
  const [profile, setProfile] = useState(null)
  const prevUidRef = useRef(null)

  // ★ Effect 1：偵測 auth 狀態（只管 user，不做其他 async）
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[Auth] event:', event)
        setUser(session?.user ?? null)
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  // ★ Effect 2：user 變化時載入 profile + 同步
  useEffect(() => {
    if (user === undefined) return  // 還沒偵測完

    let cancelled = false
    const uid = user?.id ?? null
    const prevUid = prevUidRef.current

    async function handleUserChange() {
      // 切帳號或登出 → 清 IndexedDB
      if (prevUid && uid !== prevUid) {
        await clearLocalDatabase()
        setProfile(null)
      }
      prevUidRef.current = uid

      if (!uid) {
        setProfile(null)
        return
      }

      // 載入 profile
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', uid)
          .single()

        if (!cancelled) {
          if (error) {
            console.warn('[Auth] 載入 profile 失敗:', error.message)
            setProfile(null)
          } else {
            setProfile(data)
          }
        }
      } catch (err) {
        console.warn('[Auth] 載入 profile 異常:', err.message)
        if (!cancelled) setProfile(null)
      }

      // 背景同步（不阻塞）
      fullSync().catch((err) => console.warn('[Auth] 同步失敗:', err))
    }

    handleUserChange()
    return () => { cancelled = true }
  }, [user])

  // loading 判斷：user 還是 undefined 就是載入中
  const loading = user === undefined

  async function clearLocalDatabase() {
    try {
      const tables = ['clients', 'projects', 'devices', 'daily_logs', 'work_items',
        'repair_orders', 'project_clients', 'project_devices', 'sync_meta', 'delete_queue']
      for (const table of tables) {
        if (db[table]) await db[table].clear()
      }
      console.log('[Auth] IndexedDB 已清空')
    } catch (err) {
      console.warn('[Auth] 清空 IndexedDB 失敗:', err.message)
    }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    await clearLocalDatabase()
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setUser(null)
    setProfile(null)
  }

  /**
   * ★ v1.6：重新載入 profile（例如更新 hidden_projects 後呼叫）
   */
  const refreshProfile = useCallback(async () => {
    const uid = user?.id
    if (!uid) return
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .single()
      if (!error && data) {
        setProfile(data)
      }
    } catch (err) {
      console.warn('[Auth] refreshProfile 失敗:', err.message)
    }
  }, [user])

  const role = profile?.role || 'user'

  const value = {
    user,
    profile,
    loading,
    signIn,
    signOut,
    refreshProfile,
    role,
    isAdmin: role === 'admin',
    isBoss: role === 'boss',
    canViewAll: role === 'admin' || role === 'boss',
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必須在 AuthProvider 內使用')
  return ctx
}
