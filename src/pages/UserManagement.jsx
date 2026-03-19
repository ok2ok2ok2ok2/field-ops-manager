/**
 * 使用者管理頁面（Admin 專用）
 * 版本: v1.0
 * 日期: 2026-03-19
 * 檔案: src/pages/UserManagement.jsx
 *
 * 功能：
 *  - 使用者列表（名稱、email、角色、可見案件數）
 *  - 編輯 Modal（名稱、角色、可見案件勾選）
 *  - 建立帳號（透過 Edge Function）
 */

import { useState, useMemo, useEffect } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

/* ========== 常數 ========== */

const ROLE_OPTIONS = [
  { value: 'user', label: '一般使用者' },
  { value: 'boss', label: '主管（Boss）' },
  { value: 'admin', label: '管理員（Admin）' },
]

const ROLE_STYLE = {
  admin: 'bg-red-100 text-red-600',
  boss: 'bg-purple-100 text-purple-600',
  user: 'bg-gray-100 text-gray-600',
}

const ROLE_LABEL = {
  admin: '管理員',
  boss: '主管',
  user: '使用者',
}

/* ========== 資料讀取 ========== */

async function fetchUsers() {
  // 讀取 profiles
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at')
  if (pErr) throw pErr

  // 讀取 auth.users 的 email（透過 profiles.id 查不到 email，需要用 RPC 或其他方式）
  // 因為前端無法直接查 auth.users，我們在列表上只顯示 profile 資訊
  // email 會在建帳號時記錄

  // 讀取 user_projects（每人的可見案件）
  const { data: userProjects, error: upErr } = await supabase
    .from('user_projects')
    .select('*')
  if (upErr) throw upErr

  const upMap = {}
  for (const up of (userProjects || [])) {
    if (!upMap[up.user_id]) upMap[up.user_id] = []
    upMap[up.user_id].push(up.project_id)
  }

  return (profiles || []).map((p) => ({
    ...p,
    project_ids: upMap[p.id] || [],
  }))
}

async function fetchProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, type, archived')
    .order('created_at')
  if (error) throw error
  return (data || []).filter((p) => !p.archived)
}

/* ========== 主元件 ========== */

export default function UserManagement() {
  const { isAdmin } = useAuth()
  const { data: users, mutate: mutateUsers } = useSWR('admin-users', fetchUsers)
  const { data: projects } = useSWR('admin-projects', fetchProjects)

  const [editingUser, setEditingUser] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  if (!isAdmin) {
    return (
      <div className="p-6">
        <p className="text-red-500">只有管理員可以存取此頁面</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-800">使用者管理</h2>
          <p className="text-xs text-gray-400 mt-0.5">管理帳號、角色、案件可見性</p>
        </div>
        <button onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >＋ 建立帳號</button>
      </div>

      {/* 使用者列表 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">名稱</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">角色</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">可見案件</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">建立時間</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {(users || []).map((u) => (
              <tr key={u.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {(u.display_name || '?').charAt(0)}
                    </div>
                    <span className="text-sm font-medium text-gray-800">{u.display_name || '未命名'}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_STYLE[u.role] || ROLE_STYLE.user}`}>
                    {ROLE_LABEL[u.role] || u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-gray-500">
                    {u.project_ids.length === 0 ? '全部' : `${u.project_ids.length} 個案件`}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-gray-400">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('zh-TW') : '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setEditingUser(u)}
                    className="text-xs text-blue-600 hover:text-blue-700 transition-colors"
                  >編輯</button>
                </td>
              </tr>
            ))}
            {(!users || users.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-300">載入中...</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 編輯 Modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          projects={projects || []}
          onClose={() => { setEditingUser(null); mutateUsers() }}
        />
      )}

      {/* 建立帳號 Modal */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => { setShowCreateModal(false); mutateUsers() }}
        />
      )}
    </div>
  )
}

/* ================================================================
   編輯使用者 Modal
   ================================================================ */

function EditUserModal({ user, projects, onClose }) {
  const [displayName, setDisplayName] = useState(user.display_name || '')
  const [role, setRole] = useState(user.role || 'user')
  const [selectedProjectIds, setSelectedProjectIds] = useState(user.project_ids || [])
  const [saving, setSaving] = useState(false)

  function toggleProject(pid) {
    setSelectedProjectIds((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
    )
  }

  async function handleSave() {
    setSaving(true)
    try {
      // 更新 profile
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim(), role })
        .eq('id', user.id)
      if (profileErr) throw profileErr

      // 更新 user_projects（先刪再建）
      const { error: delErr } = await supabase
        .from('user_projects')
        .delete()
        .eq('user_id', user.id)
      if (delErr) throw delErr

      if (selectedProjectIds.length > 0) {
        const rows = selectedProjectIds.map((pid) => ({
          user_id: user.id,
          project_id: pid,
        }))
        const { error: insertErr } = await supabase
          .from('user_projects')
          .insert(rows)
        if (insertErr) throw insertErr
      }

      toast.success('使用者已更新')
      onClose()
    } catch (err) {
      toast.error('儲存失敗：' + err.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">編輯使用者</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-4">
          {/* 名稱 */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">顯示名稱</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* 角色 */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">角色</label>
            <div className="flex gap-2">
              {ROLE_OPTIONS.map((r) => (
                <button key={r.value} type="button" onClick={() => setRole(r.value)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    role === r.value
                      ? r.value === 'admin' ? 'bg-red-100 text-red-700 ring-1 ring-red-300'
                      : r.value === 'boss' ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-300'
                      : 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                      : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                  }`}
                >{r.label}</button>
              ))}
            </div>
          </div>

          {/* 可見案件 */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              可見案件
              <span className="text-gray-400 font-normal ml-1">（不勾選 = 看全部）</span>
            </label>
            <div className="border border-gray-200 rounded-lg p-2 max-h-48 overflow-auto">
              {projects.length === 0 ? (
                <p className="text-xs text-gray-300 py-2 text-center">尚無案件</p>
              ) : (
                projects.map((p) => (
                  <label key={p.id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-sm transition-colors ${
                      selectedProjectIds.includes(p.id) ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-600'
                    }`}
                  >
                    <input type="checkbox"
                      checked={selectedProjectIds.includes(p.id)}
                      onChange={() => toggleProject(p.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span>{p.name}</span>
                    {p.type && <span className="text-xs text-gray-400">({p.type})</span>}
                  </label>
                ))
              )}
            </div>
            {selectedProjectIds.length > 0 && (
              <button onClick={() => setSelectedProjectIds([])}
                className="mt-1 text-xs text-blue-500 hover:text-blue-700 transition-colors"
              >清除選擇（恢復看全部）</button>
            )}
          </div>

          {/* ID 資訊 */}
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-300">UID: {user.id}</p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">取消</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >{saving ? '儲存中...' : '儲存'}</button>
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   建立帳號 Modal（呼叫 Edge Function）
   ================================================================ */

function CreateUserModal({ onClose }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('user')
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!email.trim() || !password) {
      toast.error('請填寫 Email 和密碼')
      return
    }
    if (password.length < 6) {
      toast.error('密碼至少 6 個字')
      return
    }

    setCreating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('未登入')

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            email: email.trim(),
            password,
            display_name: displayName.trim() || email.split('@')[0],
            role,
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '建立失敗')
      }

      toast.success(`帳號已建立：${result.user.display_name}`)
      onClose()
    } catch (err) {
      toast.error('建立失敗：' + err.message)
    }
    setCreating(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">建立帳號</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg transition-colors">✕</button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Email <span className="text-red-500">*</span></label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">密碼 <span className="text-red-500">*</span></label>
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 個字"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">顯示名稱</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              placeholder="留空則用 Email 前綴"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">角色</label>
            <div className="flex gap-2">
              {ROLE_OPTIONS.map((r) => (
                <button key={r.value} type="button" onClick={() => setRole(r.value)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    role === r.value
                      ? r.value === 'admin' ? 'bg-red-100 text-red-700 ring-1 ring-red-300'
                      : r.value === 'boss' ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-300'
                      : 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                      : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                  }`}
                >{r.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">取消</button>
          <button onClick={handleCreate} disabled={creating}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >{creating ? '建立中...' : '建立帳號'}</button>
        </div>
      </div>
    </div>
  )
}
