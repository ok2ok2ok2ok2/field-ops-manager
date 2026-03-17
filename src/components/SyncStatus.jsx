/**
 * 同步狀態指示器
 * 版本: v1.1
 * 日期: 2026-03-10
 * 檔案: src/components/SyncStatus.jsx
 *
 * v1.1：位置改左下角，避免擋住右下按鈕
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { fullSync, getLastSyncTime } from '../lib/syncManager'

export default function SyncStatus() {
  const isOnline = useOnlineStatus()
  const [syncState, setSyncState] = useState('done')
  const [lastSync, setLastSync] = useState(null)
  const prevOnline = useRef(isOnline)
  const isSyncing = useRef(false)

  const doSync = useCallback(async () => {
    if (!navigator.onLine) return
    if (isSyncing.current) return
    isSyncing.current = true
    setSyncState('syncing')
    const result = await fullSync((state) => {
      if (state === 'error') setSyncState('error')
    })
    if (result.success) {
      setSyncState('done')
      const time = await getLastSyncTime()
      setLastSync(time)
    }
    isSyncing.current = false
  }, [])

  useEffect(() => {
    if (isOnline && !prevOnline.current) {
      doSync()
    }
    prevOnline.current = isOnline
  }, [isOnline, doSync])

  useEffect(() => {
    const init = async () => {
      const time = await getLastSyncTime()
      setLastSync(time)
      if (navigator.onLine) doSync()
    }
    init()
  }, [doSync])

  const formatTime = (isoStr) => {
    if (!isoStr) return '尚未同步'
    const d = new Date(isoStr)
    return d.toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const stateConfig = {
    offline: { color: 'bg-red-500', text: '離線中' },
    syncing: { color: 'bg-yellow-500', text: '同步中...' },
    done:    { color: 'bg-green-500', text: '已同步' },
    error:   { color: 'bg-orange-500', text: '同步失敗' },
  }

  const currentState = !isOnline ? 'offline' : syncState
  const cfg = stateConfig[currentState]

  return (
    <div className="fixed bottom-4 left-24 z-30">
      <button
        onClick={isOnline ? doSync : undefined}
        className="flex items-center gap-2 px-3 py-2 rounded-full bg-white shadow-lg border text-sm hover:shadow-xl transition-shadow"
        title={`上次同步：${formatTime(lastSync)}\n點擊手動同步`}
      >
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${cfg.color} ${currentState === 'syncing' ? 'animate-pulse' : ''}`} />
        <span className="text-gray-700">{cfg.text}</span>
      </button>
    </div>
  )
}