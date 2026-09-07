/**
 * 連續語音擷取
 * 版本: v1.0
 * 日期: 2026-09-07
 * 檔案: src/hooks/useSpeechCapture.js
 *
 * 包 Web Speech API。免費、不用金鑰，但有幾個一定要處理的坑：
 *
 * 1. **手機 Chrome 不理 continuous**：講完停頓一下它就自己 end 掉。所以
 *    onend 時如果我們還在「錄音中」，要自己再 start 一次。
 * 2. **no-speech / aborted 是常態不是錯誤**：安靜幾秒就會丟，照樣重啟。
 *    只有 not-allowed（使用者拒絕麥克風）才真的要停。
 * 3. **螢幕一暗辨識就死**：車上很容易自動鎖屏，所以錄音期間要 Wake Lock。
 * 4. 每一段 final result 當成獨立一則。講一句、停一下、再講一句，
 *    就是兩則草稿，全程不用碰螢幕。
 *
 * 要連網（Chrome 是把音訊送到 Google 伺服器辨識的，不是離線跑）。
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const SR =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null

export default function useSpeechCapture({ lang = 'zh-TW', onFinal } = {}) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState(null)

  const recRef = useRef(null)
  const wantRef = useRef(false)      // 使用者要不要繼續錄（跟 recognition 的死活分開看）
  const wakeRef = useRef(null)
  const onFinalRef = useRef(onFinal)
  useEffect(() => { onFinalRef.current = onFinal }, [onFinal])

  const releaseWakeLock = useCallback(() => {
    if (wakeRef.current) {
      wakeRef.current.release().catch(() => {})
      wakeRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    wantRef.current = false
    setListening(false)
    setInterim('')
    releaseWakeLock()
    try {
      recRef.current?.stop()
    } catch {
      // 已經停了就算了
    }
  }, [releaseWakeLock])

  const start = useCallback(async () => {
    if (!SR) { setError('這個瀏覽器沒有語音辨識，請用 Chrome'); return }
    if (wantRef.current) return

    setError(null)
    wantRef.current = true
    setListening(true)

    // 車上很容易自動鎖屏，螢幕一暗辨識就死
    try {
      if ('wakeLock' in navigator) {
        wakeRef.current = await navigator.wakeLock.request('screen')
      }
    } catch {
      // 拿不到就算了，不影響錄音
    }

    const rec = new SR()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true

    rec.onresult = (e) => {
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const text = r[0]?.transcript || ''
        if (r.isFinal) {
          const clean = text.trim()
          if (clean) onFinalRef.current?.(clean)
        } else {
          live += text
        }
      }
      setInterim(live)
    }

    rec.onerror = (e) => {
      // 安靜太久、被系統打斷都會丟這些，屬於常態
      if (e.error === 'no-speech' || e.error === 'aborted' || e.error === 'network') return
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('麥克風被擋住了，要在瀏覽器允許麥克風')
        wantRef.current = false
        setListening(false)
        releaseWakeLock()
        return
      }
      setError(`語音辨識出錯：${e.error}`)
    }

    rec.onend = () => {
      setInterim('')
      // 手機 Chrome 停頓就自己結束，我們還想錄就再開一次
      if (wantRef.current) {
        try {
          rec.start()
        } catch {
          // 偶爾會撞到「已經在跑」，忽略
        }
      } else {
        setListening(false)
      }
    }

    recRef.current = rec
    try {
      rec.start()
    } catch (err) {
      setError('開不起來：' + err.message)
      wantRef.current = false
      setListening(false)
      releaseWakeLock()
    }
  }, [lang, releaseWakeLock])

  // 離開頁面一定要收乾淨，不然麥克風會一直開著
  useEffect(() => {
    return () => {
      wantRef.current = false
      try { recRef.current?.stop() } catch { /* 已停 */ }
      if (wakeRef.current) {
        wakeRef.current.release().catch(() => {})
        wakeRef.current = null
      }
    }
  }, [])

  return { supported: !!SR, listening, interim, error, start, stop }
}
