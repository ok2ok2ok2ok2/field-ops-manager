/**
 * 語音記事
 * 版本: v1.0
 * 日期: 2026-09-07
 * 檔案: src/pages/VoiceCapture.jsx
 *
 * 車上用的：一顆佔滿畫面的大鈕，按下去就一直聽。講一句、停一下，
 * 那句就存成一則草稿，繼續講下一句。**不要求你看螢幕、不要你改字。**
 *
 * 會暈車的是「盯著小字改錯字」那段，而那段本來就不必在車上做。
 * 回到桌前再切到「草稿」分頁一次審完，那時候改字才不難受。
 *
 * 辨識用瀏覽器內建的（免費、不用金鑰），錯字留到審核時用 ✨ 修。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useWork } from '../contexts/WorkContext'
import useSpeechCapture from '../hooks/useSpeechCapture'
import { getDrafts, addDraft, updateDraft, removeDraft } from '../lib/voiceDrafts'
import { parseQuickInput } from '../lib/quickParse'
import { createWorkItem } from '../api/workItems'
import { supabase } from '../lib/supabase'

export default function VoiceCapture() {
  const [tab, setTab] = useState(() =>
    new URLSearchParams(window.location.search).has('voice') ? 'record' : 'record'
  )
  const [drafts, setDrafts] = useState(getDrafts)
  const [justSaved, setJustSaved] = useState(0)

  const refresh = useCallback(() => setDrafts(getDrafts()), [])

  const handleFinal = useCallback((text) => {
    const d = addDraft(text)
    if (d) {
      setJustSaved((n) => n + 1)
      setDrafts(getDrafts())
    }
  }, [])

  const { supported, listening, interim, error, start, stop } = useSpeechCapture({
    lang: 'zh-TW',
    onFinal: handleFinal,
  })

  return (
    <div className="p-3 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setTab('record')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            tab === 'record' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
          }`}
        >🎙 錄音</button>
        <button
          onClick={() => { setTab('review'); refresh() }}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            tab === 'review' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
          }`}
        >📝 草稿 {drafts.length > 0 && `(${drafts.length})`}</button>
      </div>

      {tab === 'record' ? (
        <RecordView
          supported={supported} listening={listening} interim={interim}
          error={error} start={start} stop={stop}
          justSaved={justSaved} total={drafts.length}
        />
      ) : (
        <ReviewView drafts={drafts} onChanged={refresh} />
      )}
    </div>
  )
}

/* ================================================================
   錄音畫面 — 字要大、按鈕要大，掃一眼就知道有沒有在聽
   ================================================================ */

function RecordView({ supported, listening, interim, error, start, stop, justSaved, total }) {
  if (!supported) {
    return (
      <div className="bg-white rounded-2xl p-6 text-center">
        <p className="text-sm text-gray-600 mb-2">這個瀏覽器沒有語音辨識</p>
        <p className="text-xs text-gray-400">請用 Chrome 開啟，iOS 的 Safari 不支援</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <button
        onClick={listening ? stop : start}
        className={`w-full rounded-3xl py-16 md:py-20 text-white text-2xl font-bold transition-colors ${
          listening ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {listening ? '● 聽著… 點一下停止' : '🎙 開始錄'}
      </button>

      <div className="bg-white rounded-2xl p-5 min-h-[7rem]">
        {listening ? (
          <>
            <p className="text-xs text-gray-400 mb-2">講一句、停一下，那句就自動存成一則</p>
            <p className="text-lg text-gray-700 leading-relaxed">
              {interim || <span className="text-gray-300">（等你講…）</span>}
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-400">
            按上面那顆就開始。錄完不用改字，回到公司再開「草稿」分頁一次審核。
          </p>
        )}
      </div>

      <div className="flex items-center justify-center gap-6 text-center">
        <div>
          <p className="text-3xl font-bold text-blue-600">{justSaved}</p>
          <p className="text-xs text-gray-400">這次記下</p>
        </div>
        <div>
          <p className="text-3xl font-bold text-gray-400">{total}</p>
          <p className="text-xs text-gray-400">待審草稿</p>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-500 text-center bg-red-50 rounded-xl py-3">{error}</p>
      )}
    </div>
  )
}

/* ================================================================
   草稿審核 — 桌前才做，這裡才需要看清楚
   ================================================================ */

function ReviewView({ drafts, onChanged }) {
  if (drafts.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-8 text-center">
        <p className="text-sm text-gray-400">沒有待審草稿 🎉</p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {drafts.map((d) => (
        <DraftCard key={d.id} draft={d} onChanged={onChanged} />
      ))}
    </div>
  )
}

function DraftCard({ draft, onChanged }) {
  const { projects, allWorkItems, mutateWorkItems } = useWork()
  const [text, setText] = useState(draft.text)
  const [busy, setBusy] = useState('')

  // 草稿在別處被改（例如剛校正完）要跟著更新
  useEffect(() => { setText(draft.text) }, [draft.text])

  const parsed = useMemo(
    () => parseQuickInput(text, { projects }),
    [text, projects]
  )

  const finalName = parsed.location
    ? `${parsed.name}（${parsed.location}）`.trim()
    : parsed.name

  async function aiFix() {
    if (!navigator.onLine) { toast.error('離線中，校正要連網'); return }
    setBusy('fix')
    try {
      const { data } = await supabase.auth.getSession()
      const tokenValue = data?.session?.access_token
      if (!tokenValue) { toast.error('登入狀態過期，重新整理一下'); return }
      const r = await fetch('/api/fix-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenValue}` },
        body: JSON.stringify({
          text: text.trim(),
          projects: projects.map((p) => p.name),
          vocab: (allWorkItems || []).slice(0, 60).map((w) => w.name).filter(Boolean),
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j.error || `校正失敗（${r.status}）`); return }
      setText(j.corrected)
      updateDraft(draft.id, { text: j.corrected, fixed: true })
      onChanged()
      toast.success(j.changed ? '已校正' : '沒抓到錯字')
    } catch (err) {
      toast.error('校正失敗：' + err.message)
    } finally {
      setBusy('')
    }
  }

  async function accept() {
    if (!finalName.trim()) { toast.error('內容是空的'); return }
    setBusy('accept')
    try {
      await createWorkItem({
        name: finalName.trim(),
        status: '待處理',
        priority: parsed.priority || '中',
        due_date: parsed.due_date || null,
        project_id: parsed.project_id || null,
      })
      mutateWorkItems()
      removeDraft(draft.id)
      onChanged()
      toast.success('已建立待辦')
    } catch (err) {
      toast.error('建立失敗：' + err.message)
    } finally {
      setBusy('')
    }
  }

  function discard() {
    removeDraft(draft.id)
    onChanged()
  }

  const when = draft.createdAt ? draft.createdAt.slice(5, 16).replace('T', ' ') : ''

  return (
    <div className="bg-white rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">{when}</span>
        {draft.fixed && <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-600">已校正</span>}
      </div>

      <textarea
        value={text}
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (text !== draft.text) { updateDraft(draft.id, { text }); onChanged() } }}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {parsed.due_date && <Chip icon="📅" text={parsed.due_date} />}
        {parsed.project_name && <Chip icon="📁" text={parsed.project_name} />}
        {parsed.priority && <Chip icon="⚡" text={parsed.priority} />}
        {parsed.location && <Chip icon="📍" text={parsed.location} />}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={aiFix} disabled={!!busy}
          className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 transition-colors"
        >{busy === 'fix' ? '校正中…' : '✨ 修錯字'}</button>
        <button onClick={accept} disabled={!!busy}
          className="flex-1 px-3 py-1.5 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >{busy === 'accept' ? '建立中…' : '建立待辦'}</button>
        <button onClick={discard} disabled={!!busy}
          className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:bg-gray-100 hover:text-red-500 disabled:opacity-40 transition-colors"
        >丟掉</button>
      </div>
    </div>
  )
}

function Chip({ icon, text }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">
      <span>{icon}</span>{text}
    </span>
  )
}
