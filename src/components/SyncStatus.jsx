/**
 * 同步狀態指示器
 * 版本: v2.1
 * 日期: 2026-09-07
 * 檔案: src/components/SyncStatus.jsx
 *
 * v2.1：不再 fixed 浮在左下角 —— 待辦列加了快速輸入之後，這顆剛好蓋住
 *       「待完成事項」標題，也就是桌機展開時間軸的 hover 觸發區。
 *       改成一般元素，由 PendingPanel 直接排進底部列裡
 * v2.0：加超時保護（30秒）+ 同步失敗時正確重置狀態 + 同步前二次確認網路
 * v1.1：位置改左下角，避免擋住右下按鈕
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { fullSync, getLastSyncTime } from '../lib/syncManager'

const SYNC_TIMEOUT_MS = 30000 // 30 秒超時

export default function SyncStatus() {
  const isOnline = useOnlineStatus()
  const [syncState, setSyncState] = useState('done')
  const [lastSync, setLastSync] = useState(null)
  const prevOnline = useRef(isOnline)
  const isSyncing = useRef(false)
  const timeoutRef = useRef(null)

  // 清除超時計時器
  const clearSyncTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const doSync = useCallback(async () => {
    // 二次確認網路狀態
    if (!navigator.onLine) {
      setSyncState('offline')
      return
    }
    if (isSyncing.current) return
    isSyncing.current = true
    setSyncState('syncing')

    // 設定超時保護
    clearSyncTimeout()
    timeoutRef.current = setTimeout(() => {
      console.warn('[SyncStatus] 同步超時（30秒），強制結束')
      isSyncing.current = false
      setSyncState('error')
    }, SYNC_TIMEOUT_MS)

    try {
      const result = await fullSync((state) => {
        if (state === 'error') setSyncState('error')
      })

      clearSyncTimeout()

      if (result.success) {
        setSyncState('done')
        const time = await getLastSyncTime()
        setLastSync(time)
      } else {
        setSyncState('error')
      }
    } catch (err) {
      clearSyncTimeout()
      console.error('[SyncStatus] 同步異常:', err)
      setSyncState('error')
    } finally {
      isSyncing.current = false
    }
  }, [clearSyncTimeout])

  // 網路恢復時自動同步
  useEffect(() => {
    if (isOnline && !prevOnline.current) {
      doSync()
    }
    prevOnline.current = isOnline
  }, [isOnline, doSync])

  // App 啟動時同步一次
  useEffect(() => {
    const init = async () => {
      const time = await getLastSyncTime()
      setLastSync(time)
      if (navigator.onLine) doSync()
    }
    init()
  }, [doSync])

  // 元件卸載時清除計時器
  useEffect(() => {
    return () => clearSyncTimeout()
  }, [clearSyncTimeout])

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
    <button
      onClick={isOnline ? doSync : undefined}
      className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-gray-200 text-xs hover:bg-gray-50 transition-colors"
      title={`上次同步：${formatTime(lastSync)}\n點擊手動同步`}
    >
      <span className={`inline-block w-2 h-2 rounded-full ${cfg.color} ${currentState === 'syncing' ? 'animate-pulse' : ''}`} />
      <span className="text-gray-600 whitespace-nowrap">{cfg.text}</span>
    </button>
  )
}
