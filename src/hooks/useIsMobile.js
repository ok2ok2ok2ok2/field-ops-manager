/**
 * 螢幕寬度斷點偵測
 * 版本: v1.0
 * 日期: 2026-08-24
 * 檔案: src/hooks/useIsMobile.js
 *
 * 手機版面切換的唯一判斷來源。< 768px 視為手機。
 * 會跟著視窗縮放 / 轉向即時更新。
 */

import { useEffect, useState } from 'react'

const QUERY = '(max-width: 767px)'

export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(QUERY).matches
      : false
  )

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(QUERY)
    const onChange = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
