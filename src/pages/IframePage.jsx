/**
 * 通用 iframe 嵌入頁面
 * 版本: v1.2
 * 日期: 2026-04-07
 * 檔案: src/pages/IframePage.jsx
 *
 * v1.2：移除外層滾動容器，避免雙重滾動條；iframe 直接撐滿主區域
 * v1.1：隱藏滾動條但保留滾動功能
 * v1.0：初版
 */

import { useSearchParams } from 'react-router-dom'

const IFRAME_MAP = {
  'server-daily':    { url: 'https://station-check.vercel.app/daily.html',    title: '每日填寫' },
  'server-stats':    { url: 'https://station-check.vercel.app/stats.html',    title: '統計報表' },
  'server-servers':  { url: 'https://station-check.vercel.app/servers.html',  title: '伺服器管理' },
  'server-slopes':   { url: 'https://station-check.vercel.app/slopes.html',   title: '坡面管理' },
  'server-options':  { url: 'https://station-check.vercel.app/options.html',  title: '選項設定' },
  'server-alerts':   { url: 'https://station-check.vercel.app/alerts.html',   title: '提醒規則' },
  'website-monitor': { url: 'https://website-monitor-rho.vercel.app/',        title: '站點警報' },
}

export default function IframePage() {
  const [searchParams] = useSearchParams()
  const page = searchParams.get('page') || ''
  const config = IFRAME_MAP[page]

  if (!config) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        頁面不存在
      </div>
    )
  }

  return (
    <iframe
      src={config.url}
      title={config.title}
      className="w-full h-full border-0"
      allow="clipboard-read; clipboard-write"
    />
  )
}
