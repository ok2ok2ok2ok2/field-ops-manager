/**
 * 變更自己的密碼
 * 版本: v1.0
 * 日期: 2026-11-04
 * 檔案: src/components/PasswordModal.jsx
 *
 * 先用目前密碼重新登入一次確認是本人（手機借人用、沒登出時，別人改不掉你的密碼），
 * 再 supabase.auth.updateUser({ password })。不經過 Edge Function。
 */

import { useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function PasswordModal({ open, onClose }) {
  const { user } = useAuth()
  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (!open) return null

  function close() {
    setCur(''); setPw(''); setPw2(''); setErr('')
    onClose()
  }

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (!cur || !pw) return setErr('請填寫目前密碼與新密碼')
    if (pw.length < 6) return setErr('新密碼至少 6 個字')
    if (pw !== pw2) return setErr('兩次輸入的新密碼不一樣')
    if (pw === cur) return setErr('新密碼和目前密碼一樣')
    setBusy(true)
    try {
      const { error: e1 } = await supabase.auth.signInWithPassword({ email: user.email, password: cur })
      if (e1) { setErr('目前密碼不對'); return }
      const { error: e2 } = await supabase.auth.updateUser({ password: pw })
      if (e2) { setErr('變更失敗：' + e2.message); return }
      toast.success('密碼已變更，下次登入請用新密碼')
      close()
    } finally {
      setBusy(false)
    }
  }

  const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={close}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-3"
      >
        <h2 className="text-lg font-bold text-gray-800">🔑 變更密碼</h2>
        <p className="text-xs text-gray-500 break-all">{user?.email}</p>
        <input type="password" autoComplete="current-password" placeholder="目前密碼"
          value={cur} onChange={(e) => setCur(e.target.value)} className={input} autoFocus />
        <input type="password" autoComplete="new-password" placeholder="新密碼（至少 6 個字）"
          value={pw} onChange={(e) => setPw(e.target.value)} className={input} />
        <input type="password" autoComplete="new-password" placeholder="再輸入一次新密碼"
          value={pw2} onChange={(e) => setPw2(e.target.value)} className={input} />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={close} className="px-4 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100">取消</button>
          <button type="submit" disabled={busy}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? '處理中…' : '變更'}
          </button>
        </div>
      </form>
    </div>
  )
}
