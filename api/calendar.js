/**
 * 公司共用日曆（維興專用）唯讀 API
 * 版本: v1.1
 * 日期: 2026-11-03
 * 檔案: api/calendar.js
 *
 * GET /api/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD （含頭含尾，台北時間，最多 62 天）
 * 回 { events: [{ id, summary, location, startDate, endDate, startTime, endTime, allDay, creator }] }
 *
 * 認證：前端帶 Supabase access token，拿去問 Supabase 換使用者（同 api/fix-text.js），
 *       否則任何人都能讀公司行程。
 * Google 端：用服務帳戶簽 JWT 換 token（同 website-monitor lib/google-auth.js 的做法；
 *       瀏覽器 OAuth 那組在測試模式 refresh token 七天過期，不能給伺服器用）。
 *
 * 環境變數（field-ops 的 Vercel 專案要自己加，值從 website-monitor 專案複製）：
 *   GOOGLE_SA_JSON   服務帳戶金鑰 JSON 全文（⚠ 憑證，只進環境變數；記進 docs/infra.md 輪換表）
 *   CAL_CALENDAR_ID  選填，預設維興專用
 *   CAL_PEOPLE_MAP   選填，「a@gmail.com=小林,b@gmail.com=阿豪」建立者信箱對暱稱
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY  建置時本來就有
 *
 * ⚠ 絕不回傳信箱：建立者只回暱稱，對不到就回 null。
 *
 * v1.1: 建立者規則跟 LINE bot (website-monitor creatorLabel) 一致 —
 *       暱稱表 → Google 顯示名稱 (含 @ 不用) → 服務帳戶建的標「LINE Bot」;
 *       原本只看暱稱表, 沒設 CAL_PEOPLE_MAP 時全部空白
 */

import crypto from 'crypto'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://www.googleapis.com/calendar/v3'
const DEFAULT_CALENDAR_ID = '2gcg7ssn8tjunpqesflko7ub5o@group.calendar.google.com'
const TZ = 'Asia/Taipei'

let cached = null // { token, expiresAt } 同一個 lambda 實例內重用

async function verifyUser(token) {
  const url = process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon || !token) return null
  try {
    const r = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: anon } })
    if (!r.ok) return null
    const u = await r.json()
    return u && u.id ? u.id : null
  } catch {
    return null
  }
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function getGoogleToken() {
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.expiresAt - 60 > now) return cached.token
  const sa = JSON.parse(process.env.GOOGLE_SA_JSON || '{}')
  if (!sa.client_email || !sa.private_key) throw new Error('沒設定 GOOGLE_SA_JSON')
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/calendar.readonly',
    aud: TOKEN_URL, iat: now, exp: now + 3600,
  }))}`
  const sig = b64url(crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key))
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || !d.access_token) throw new Error(`換 Google token 失敗 HTTP ${r.status}: ${d.error || ''}`)
  cached = { token: d.access_token, expiresAt: now + (d.expires_in || 3600) }
  return cached.token
}

function peopleMap() {
  const m = {}
  for (const pair of (process.env.CAL_PEOPLE_MAP || '').split(',')) {
    const [email, nick] = pair.split('=').map((s) => (s || '').trim())
    if (email && nick) m[email.toLowerCase()] = nick
  }
  return m
}

function prevDay(iso) {
  const t = new Date(`${iso}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() - 1)
  return t.toISOString().slice(0, 10)
}

function creatorLabel(ev, people) {
  if (ev.extendedProperties?.private?.source === 'line-bot') return 'LINE Bot'
  const email = (ev.creator?.email || '').trim().toLowerCase()
  if (!email) return null
  if (email.endsWith('.gserviceaccount.com')) return 'LINE Bot'
  if (people[email]) return people[email]
  const display = (ev.creator?.displayName || '').trim()
  return display && !display.includes('@') ? display : null
}

function mapEvent(ev, people) {
  const allDay = !!ev.start?.date
  const s = ev.start?.dateTime || ev.start?.date || ''
  const e = ev.end?.dateTime || ev.end?.date || s
  return {
    id: ev.id,
    summary: ev.summary || '（無標題）',
    location: ev.location || '',
    allDay,
    startDate: s.slice(0, 10),
    // 全天活動 end.date 是「隔天」不含當天，要退一天
    endDate: allDay ? prevDay(e.slice(0, 10)) : e.slice(0, 10),
    startTime: allDay ? null : s.slice(11, 16),
    endTime: allDay ? null : e.slice(11, 16),
    creator: creatorLabel(ev, people),
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: '只收 GET' })

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!(await verifyUser(token))) return res.status(401).json({ error: '未登入' })

  const { start, end } = req.query || {}
  if (!ISO.test(start || '') || !ISO.test(end || '') || end < start) {
    return res.status(400).json({ error: 'start/end 要 YYYY-MM-DD 且 end >= start' })
  }
  if ((new Date(end) - new Date(start)) / 86400000 > 62) {
    return res.status(400).json({ error: '一次最多查 62 天' })
  }

  try {
    const gtoken = await getGoogleToken()
    const calId = (process.env.CAL_CALENDAR_ID || '').trim() || DEFAULT_CALENDAR_ID
    const url = new URL(`${API}/calendars/${encodeURIComponent(calId)}/events`)
    url.search = new URLSearchParams({
      timeMin: `${start}T00:00:00+08:00`, timeMax: `${end}T23:59:59+08:00`,
      singleEvents: 'true', orderBy: 'startTime', timeZone: TZ, maxResults: '250',
    }).toString()
    const r = await fetch(url, { headers: { Authorization: `Bearer ${gtoken}` } })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(`Calendar API HTTP ${r.status}: ${body.error?.message || ''}`)
    const people = peopleMap()
    const events = (body.items || []).filter((ev) => ev.status !== 'cancelled').map((ev) => mapEvent(ev, people))
    res.setHeader('Cache-Control', 'private, max-age=60')
    return res.status(200).json({ events })
  } catch (err) {
    const missing = /GOOGLE_SA_JSON/.test(err.message)
    return res.status(missing ? 503 : 502).json({ error: err.message })
  }
}
