/**
 * 語音輸入錯字校正 API
 * 版本: v1.0
 * 日期: 2026-09-07
 * 檔案: api/fix-text.js
 *
 * Vercel serverless function。手機鍵盤語音把行話聽成別的字（實測「更換硬碟」
 * 會變「吸收硬碟」），這支把整句丟給 DeepSeek 修回來。
 *
 * ⚠ 只修錯字，不抽欄位。日期／案件／優先權一律由前端的 quickParse.js 從
 *   修好的句子重算 —— 兩邊都能決定欄位的話，對不起來時沒人知道該信誰。
 *
 * 認證：前端要帶 Supabase access token，這裡拿去問 Supabase 換使用者。
 * 沒有這關就是一支開放的代理，任何人都能燒我們的 API 額度。
 *
 * 環境變數（Vercel 專案設定）：
 *   DEEPSEEK_API_KEY   ← 這支新加的，要自己去 Vercel 後台設
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ← 建置時本來就有，直接沿用
 */

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
const MAX_TEXT = 200
const MAX_VOCAB = 60

const SYSTEM_PROMPT = `你是台灣工程監測公司的待辦記事校正助手。

使用者用手機語音輸入一句待辦事項，語音辨識常常把專業術語聽成同音的別字，
例如把「更換」聽成「吸收」、把「基站」聽成「機戰」、把站號「5566」聽成「五五六六」。

你的工作只有一件：把這句話的錯字修回來。規則：

1. 只改明顯聽錯的詞，其他一個字都不要動。不要改寫語氣、不要潤飾、不要增刪內容。
2. 口語念出來的數字改成半形阿拉伯數字（「五五六六」→「5566」）。
3. 日期、星期、優先權的講法**保持原樣不要改**（「下禮拜五」就留「下禮拜五」），
   後面有程式會處理，你改了反而會對不上。
4. 參考下面提供的案件名稱與這位使用者以前打過的待辦，那些才是正確的用詞。
5. 如果整句看起來沒有錯字，就原封不動回傳。

只回傳修正後的那一句話，不要加任何說明、標點裝飾或引號。`

async function verifyUser(token) {
  const url = process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) return null
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
    })
    if (!r.ok) return null
    const u = await r.json()
    return u && u.id ? u.id : null
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只收 POST' })
  }

  const key = process.env.DEEPSEEK_API_KEY
  if (!key) {
    return res.status(503).json({ error: '後端還沒設定 DEEPSEEK_API_KEY' })
  }

  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return res.status(401).json({ error: '沒有帶登入憑證' })
  const userId = await verifyUser(token)
  if (!userId) return res.status(401).json({ error: '登入憑證無效' })

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
  const text = String(body.text || '').trim()
  if (!text) return res.status(400).json({ error: '沒有東西要修' })
  if (text.length > MAX_TEXT) {
    return res.status(400).json({ error: `一次最多 ${MAX_TEXT} 字` })
  }

  // 用使用者自己的案件名稱與既有待辦當詞彙表，比寫死一份通用術語表準
  const projects = Array.isArray(body.projects) ? body.projects.slice(0, MAX_VOCAB) : []
  const vocab = Array.isArray(body.vocab) ? body.vocab.slice(0, MAX_VOCAB) : []

  const userPrompt = [
    projects.length ? `案件名稱：\n${projects.map((p) => `- ${p}`).join('\n')}` : '',
    vocab.length ? `這位使用者以前打過的待辦（正確用詞參考）：\n${vocab.map((v) => `- ${v}`).join('\n')}` : '',
    `要修正的句子：\n${text}`,
  ].filter(Boolean).join('\n\n')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)

  try {
    const r = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
        max_tokens: 300,
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!r.ok) {
      const detail = await r.text()
      console.error('[fix-text] DeepSeek 回', r.status, detail.slice(0, 300))
      return res.status(502).json({ error: `校正服務回 ${r.status}` })
    }

    const data = await r.json()
    const corrected = (data?.choices?.[0]?.message?.content || '').trim()
    if (!corrected) {
      return res.status(502).json({ error: '校正服務沒有回內容' })
    }
    // 模型偶爾會自己加引號，剝掉
    const clean = corrected.replace(/^["'「『]+|["'」』]+$/g, '').trim()
    return res.status(200).json({ corrected: clean || text, changed: clean !== text })
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: '校正逾時，直接手動改比較快' })
    }
    console.error('[fix-text]', err)
    return res.status(500).json({ error: '校正失敗' })
  }
}

export const config = { maxDuration: 30 }
