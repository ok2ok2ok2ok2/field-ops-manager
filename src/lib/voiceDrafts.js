/**
 * 語音草稿本機儲存
 * 版本: v1.0
 * 日期: 2026-09-07
 * 檔案: src/lib/voiceDrafts.js
 *
 * 車上錄下來的東西先存在這裡，不寫進 Supabase。回到桌前審核過才變成
 * 真的待辦。理由有兩個：
 *   1. 沒確認過的東西不該進共用資料庫，別人會看到半成品。
 *   2. 車上訊號不穩，本機存最保險。
 *
 * 用 localStorage 而不是 IndexedDB：只存文字，量很小，也不必動
 * offlineDb 的 Dexie 版本（改 schema 要升版，風險不值得）。
 * 這是每台裝置各自的暫存，不同步、不跨裝置，本來就該如此。
 */

const KEY = 'voice-drafts'
const MAX_DRAFTS = 200

function readAll() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list : []
  } catch (err) {
    console.warn('[voiceDrafts] 讀不到草稿', err)
    return []
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_DRAFTS)))
    return true
  } catch (err) {
    console.warn('[voiceDrafts] 寫不進草稿', err)
    return false
  }
}

/** 新到舊 */
export function getDrafts() {
  return readAll().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
}

export function addDraft(text) {
  const clean = String(text || '').trim()
  if (!clean) return null
  const draft = {
    id: `vd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text: clean,
    createdAt: new Date().toISOString(),
    fixed: false, // 有沒有經過 AI 校正
  }
  const list = readAll()
  list.unshift(draft)
  return writeAll(list) ? draft : null
}

export function updateDraft(id, patch) {
  const list = readAll()
  const i = list.findIndex((d) => d.id === id)
  if (i < 0) return false
  list[i] = { ...list[i], ...patch }
  return writeAll(list)
}

export function removeDraft(id) {
  return writeAll(readAll().filter((d) => d.id !== id))
}

export function countDrafts() {
  return readAll().length
}
