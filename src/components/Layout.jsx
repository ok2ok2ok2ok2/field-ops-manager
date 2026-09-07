/**
 * 主佈局元件
 * 版本: v3.6
 * 日期: 2026-09-07
 * 檔案: src/components/Layout.jsx
 *
 * v3.6：底部待辦列加 QuickAddBar 一行快速輸入（解析日期／案件／優先權／地點）；
 *       優先權預設不顯示，按 ⚙ 才展開；分享／捷徑進來自動聚焦
 * v3.5：待辦改「整頁時間軸」— 桌機滑鼠移到底部列就彈出整頁，
 *       依案件分組畫時間軸；觸控只認點擊（點標題開、✕／底色／Esc 關）
 * v3.4：ProjectBar / PendingPanel 改「滑鼠 hover 或點標題展開」，
 *       觸控不再卡在展開（useExpandablePanel）
 * v3.3：h-screen 改 h-dvh — 100vh 在手機算的是網址列收起後的高度，
 *       導致底部待辦列掉在畫面外，要往下拉才看得到
 * v3.2：離開手機寬度時關掉抽屜；手機頂欄標題補 /monitor fallback
 * v3.1：手機版面 — 頂欄漢堡鈕 + 側邊欄抽屜（桌機行為不變）
 * v3.0：整合 WorkProvider，全域顯示 ProjectBar + PendingPanel + 相關 Modal
 *       ProjectBar / PendingPanel / ProjectCard / VisibilityModal / ProjectModal / WorkItemModal
 *       全部從 WorkDashboard 搬到此處
 * v2.1：加入 SyncStatus
 * v2.0：Sidebar + Outlet 結構
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import Sidebar from './Sidebar'
import SyncStatus from './SyncStatus'
import { WorkProvider, useWork } from '../contexts/WorkContext'
import { getClients } from '../api/clients'
import {
  getAllowedProjects, updateHiddenProjects,
  createProject, updateProject, updateProjectClients,
} from '../api/projects'
import {
  createWorkItem, updateWorkItem, deleteWorkItem,
} from '../api/workItems'
import { getLogByDate, createLog } from '../api/dailyLogs'
import { useAuth } from '../contexts/AuthContext'
import useIsMobile from '../hooks/useIsMobile'
import { ALL_NAV_ITEMS } from '../lib/navItems'
import { parseQuickInput } from '../lib/quickParse'
import { getQuickAddDraft, clearQuickAddDraft } from '../lib/quickAddDraft'

/* ================================================================
   外層：用 WorkProvider 包住內層
   ================================================================ */

export default function Layout() {
  return (
    <WorkProvider>
      <LayoutInner />
    </WorkProvider>
  )
}

/* ================================================================
   內層：Sidebar + ProjectBar + Outlet + PendingPanel + Modal
   ================================================================ */

function LayoutInner() {
  const work = useWork()
  const isMobile = useIsMobile()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // 換頁 / 瀏覽器上一頁都要把抽屜關掉
  const routeKey = location.pathname + location.search
  const [lastRoute, setLastRoute] = useState(routeKey)
  if (lastRoute !== routeKey) {
    setLastRoute(routeKey)
    setDrawerOpen(false)
  }

  // 拉寬到桌機時抽屜狀態要歸零，不然縮回手機會自己彈開
  const [lastIsMobile, setLastIsMobile] = useState(isMobile)
  if (lastIsMobile !== isMobile) {
    setLastIsMobile(isMobile)
    setDrawerOpen(false)
  }

  return (
    <div className="flex h-dvh overflow-hidden" style={{ backgroundColor: '#f0f2f5' }}>
      <Sidebar mobileOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 手機頂欄 */}
        {isMobile && <MobileTopBar onMenu={() => setDrawerOpen(true)} />}

        {/* 上方：案件方塊列 */}
        <ProjectBar />

        {/* 中間：頁面內容 */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>

        {/* 下方：待辦事項面板 */}
        <PendingPanel />
      </div>
      <SyncStatus />

      {/* 全域 Modal */}
      {work.projectModalMode && (
        <ProjectModal
          mode={work.projectModalMode}
          project={work.editingProject}
          onClose={work.handleProjectModalClose}
        />
      )}
      {work.showVisibilityModal && <VisibilityModal />}
      {work.wiModalItem !== undefined && <WorkItemModal />}
    </div>
  )
}

/* ================================================================
   useExpandablePanel — 面板展開狀態

   只認 pointerType === 'mouse'。觸控會送出模擬的 pointerenter，
   但永遠不送 pointerleave，綁上去面板就會卡在展開收不回來
   （手機、觸控筆電都中招）。觸控改由點標題切換。
   ================================================================ */

function useExpandablePanel() {
  const [hoverState, setHoverState] = useState(false)
  const [clickOpen, setClickOpen] = useState(false)
  return {
    expanded: hoverState || clickOpen,
    toggle: () => setClickOpen((v) => !v),
    hoverProps: {
      onPointerEnter: (e) => { if (e.pointerType === 'mouse') setHoverState(true) },
      onPointerLeave: (e) => { if (e.pointerType === 'mouse') setHoverState(false) },
    },
  }
}

/* ================================================================
   MobileTopBar — 手機頂欄（漢堡鈕 + 目前頁面標題）
   ================================================================ */

function MobileTopBar({ onMenu }) {
  const location = useLocation()
  const full = location.pathname + location.search
  const current =
    ALL_NAV_ITEMS.find((it) => it.path === full) ||
    ALL_NAV_ITEMS.find((it) => !it.path.includes('?') && it.path === location.pathname)

  return (
    <div className="flex items-center gap-2 px-2 h-12 bg-white border-b border-gray-200 flex-shrink-0">
      <button
        onClick={onMenu}
        className="w-10 h-10 flex items-center justify-center rounded-lg text-xl text-gray-600 hover:bg-gray-100 transition-colors"
        title="開啟選單"
      >
        ☰
      </button>
      <span className="text-sm font-medium text-gray-700 truncate">
        {current
          ? `${current.icon} ${current.label}`
          : location.pathname.startsWith('/monitor') ? '📡 監控中心' : '工作管理系統'}
      </span>
    </div>
  )
}

/* ================================================================
   ProjectBar — 案件方塊列
   ================================================================ */

function ProjectBar() {
  const {
    projects, projectItemCounts, filterProjectId,
    handleProjectClick, handleCreateProject, handleEditProject,
    handleArchiveProject, setShowVisibilityModal,
  } = useWork()

  const { expanded, toggle, hoverProps } = useExpandablePanel()
  const totalItems = Object.values(projectItemCounts).reduce((sum, n) => sum + n, 0)

  return (
    <div
      {...hoverProps}
      className="border-b border-gray-200 bg-white transition-all duration-200 ease-in-out flex-shrink-0"
      style={{ minHeight: expanded ? 120 : 48 }}
    >
      <div className="flex items-center justify-between px-3 md:px-5 h-12 gap-2">
        <button
          onClick={toggle}
          className="flex items-center gap-2 min-w-0 px-1 py-1 rounded-lg hover:bg-gray-50 transition-colors"
          title={expanded ? '收合案件列' : '展開案件列'}
        >
          <span className="text-xs text-gray-400 flex-shrink-0">{expanded ? '▼' : '▶'}</span>
          <span className="text-sm font-medium text-gray-600 whitespace-nowrap">案件總覽</span>
          <span className="hidden md:inline text-xs text-gray-400">（{projects.length} 案件，{totalItems} 工作項目）</span>
        </button>
        <div className="flex items-center gap-2 flex-shrink-0">
          {filterProjectId && (
            <button onClick={() => handleProjectClick(filterProjectId)}
              className="text-xs text-blue-500 hover:text-blue-700 transition-colors">✕ 取消篩選</button>
          )}
          <button onClick={() => setShowVisibilityModal(true)}
            className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
            title="設定要顯示哪些案件"
          >👁 篩選</button>
          <button onClick={handleCreateProject}
            className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">＋ 新增案件</button>
        </div>
      </div>
      <div className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{ maxHeight: expanded ? 300 : 0, opacity: expanded ? 1 : 0 }}>
        <div className="flex gap-3 px-3 md:px-5 pb-4 overflow-x-auto">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} count={projectItemCounts[p.id] || 0}
              isActive={filterProjectId === p.id}
              onFilter={() => handleProjectClick(p.id)}
              onEdit={() => handleEditProject(p)}
              onArchive={() => handleArchiveProject(p)} />
          ))}
          {projects.length === 0 && <p className="text-xs text-gray-300 py-2">尚無案件，點右上角新增</p>}
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   ProjectCard — 單張案件卡片
   ================================================================ */

function ProjectCard({ project, count, isActive, onFilter, onEdit, onArchive }) {
  const { PROJECT_TYPE_ICON } = useWork()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    function h(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

  return (
    <div className={`relative flex-shrink-0 w-44 p-3 rounded-xl border-2 cursor-pointer transition-all duration-150 ${
      isActive ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-100 bg-gray-50 hover:border-gray-300 hover:shadow-sm'
    }`}>
      <div ref={menuRef} className="absolute top-1.5 right-1.5">
        <button onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors text-xs">⋯</button>
        {menuOpen && (
          <div className="absolute right-0 top-7 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20 w-28">
            <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit() }}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">編輯</button>
            <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onArchive() }}
              className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 transition-colors">隱藏</button>
          </div>
        )}
      </div>
      <div onClick={onFilter}>
        <div className="flex items-center gap-2 mb-1.5 pr-6">
          <span className="text-base">{PROJECT_TYPE_ICON[project.type] || '📁'}</span>
          <span className="text-sm font-medium text-gray-800 truncate">{project.name}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{project.type || '未分類'}</span>
          <span className={`text-xs font-medium ${count > 0 ? 'text-blue-600' : 'text-gray-300'}`}>{count} 項</span>
        </div>
        {project.clients && project.clients.length > 0 && (
          <p className="text-xs text-gray-400 mt-1 truncate">{project.clients.map((c) => c.name).join('、')}</p>
        )}
      </div>
    </div>
  )
}

/* ================================================================
   PendingPanel — 待完成事項（底部列 + 整頁時間軸）

   桌機：滑鼠移到底部列 → 整頁時間軸彈出（依案件分組）
   觸控：只認點擊。觸控會送出模擬 pointerenter 但永遠不送
         pointerleave，綁 hover 會卡在展開收不回來。
   ================================================================ */

const PRIORITY_BADGE = { '高': 'bg-red-100 text-red-600', '中': 'bg-amber-100 text-amber-600', '低': 'bg-gray-100 text-gray-500' }
const STATUS_BADGE = { '待處理': 'bg-gray-100 text-gray-600', '進行中': 'bg-blue-100 text-blue-600', '擱置': 'bg-amber-100 text-amber-600' }

/* 到期狀態 → 圓點顏色 / 文字顏色 */
const DUE_TONE = {
  overdue: { dot: 'bg-red-500', text: 'text-red-600 font-medium' },
  today: { dot: 'bg-orange-500', text: 'text-orange-600 font-medium' },
  soon: { dot: 'bg-amber-400', text: 'text-amber-600' },
  later: { dot: 'bg-blue-400', text: 'text-gray-500' },
  none: { dot: 'bg-gray-300', text: 'text-gray-300' },
}

function dueMeta(due, todayStr) {
  if (!due) return { label: '未排定', tone: 'none', order: 99999 }
  const d = Math.round(
    (new Date(due + 'T00:00:00') - new Date(todayStr + 'T00:00:00')) / 86400000
  )
  const md = due.substring(5)
  if (d < 0) return { label: md + '　逾期 ' + (-d) + ' 天', tone: 'overdue', order: d }
  if (d === 0) return { label: md + '　今天到期', tone: 'today', order: 0 }
  if (d <= 3) return { label: md + '　還有 ' + d + ' 天', tone: 'soon', order: d }
  return { label: md, tone: 'later', order: d }
}

/* ── hover（滑鼠）／點擊（觸控）兩用的開關 ───────────────────

   兩組 props 分工，避免「面板一彈出就自己關掉」：
   - triggerProps（底部列）：進入排程開啟，離開只取消排程，不排關閉。
     面板一彈出就蓋住底部列，底部列必然收到 pointerleave；
     若那裡排關閉，就會跟面板的 pointerenter 搶時序。
   - panelProps（面板）：進入取消關閉，離開才排關閉。
   兩者都只認 pointerType === 'mouse'；觸控送 pointerenter 卻永遠
   不送 pointerleave，綁上去會卡在展開收不回來。
   ================================================================ */

function useHoverOverlay() {
  const [open, setOpen] = useState(false)
  const timerRef = useRef(null)

  function clearTimer() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }
  useEffect(() => clearTimer, [])

  return {
    open,
    close: () => { clearTimer(); setOpen(false) },
    toggle: () => { clearTimer(); setOpen((v) => !v) },
    triggerProps: {
      onPointerEnter: (e) => {
        if (e.pointerType !== 'mouse') return
        clearTimer()
        timerRef.current = setTimeout(() => setOpen(true), 150)
      },
      onPointerLeave: (e) => {
        if (e.pointerType !== 'mouse') return
        clearTimer()
      },
    },
    panelProps: {
      onPointerEnter: (e) => { if (e.pointerType === 'mouse') clearTimer() },
      onPointerLeave: (e) => {
        if (e.pointerType !== 'mouse') return
        clearTimer()
        timerRef.current = setTimeout(() => setOpen(false), 200)
      },
    },
  }
}

/* ================================================================
   QuickAddBar — 一行快速輸入

   打一句話直接建待辦，日期／案件／優先權從句子裡解析出來。
   手機不自己做語音辨識：按鍵盤上的麥克風鍵講，文字進到這個框，
   看得到也改得動，送出前還有機會修。2026-07-30 試過 Web Speech
   自己辨識，錯誤率高又不會自我校正，已否決。

   優先權預設不出現，要按 ⚙ 才展開；平常打字不必想這件事。
   ================================================================ */

function QuickAddBar() {
  const { projects, mutateWorkItems, PRIORITY_OPTIONS } = useWork()
  const inputRef = useRef(null)

  // 分享／捷徑進來的文字在 quickAddDraft.js 模組載入時就收下了
  // （比 React 渲染早，早於 /login 轉址把網址洗掉）
  const fromShare = getQuickAddDraft() !== null
  const [text, setText] = useState(() => getQuickAddDraft() || '')
  const [advOpen, setAdvOpen] = useState(false)
  const [override, setOverride] = useState({})
  const [saving, setSaving] = useState(false)

  // 從分享／捷徑進來就把游標放進輸入框，順手把網址參數與草稿清掉
  useEffect(() => {
    if (!fromShare) return
    clearQuickAddDraft()
    inputRef.current?.focus()
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [fromShare])

  const parsed = useMemo(
    () => parseQuickInput(text, { projects }),
    [text, projects]
  )

  // 手動設定蓋過解析結果
  const due_date = override.due_date !== undefined ? override.due_date : parsed.due_date
  const priority = override.priority !== undefined ? override.priority : parsed.priority
  const project_id = override.project_id !== undefined ? override.project_id : parsed.project_id

  // work_items 還沒有 location 欄位，先接回名稱裡不要弄丟
  // （之後要接 AI 排行程、天氣、導航才需要真的加欄位）
  const finalName = parsed.location
    ? `${parsed.name}（${parsed.location}）`.trim()
    : parsed.name

  const canSubmit = finalName.trim().length > 0 && !saving

  async function submit() {
    if (!canSubmit) {
      if (!saving) toast.error('要先打點東西')
      return
    }
    setSaving(true)
    try {
      await createWorkItem({
        name: finalName.trim(),
        status: '待處理',
        priority: priority || '中',
        due_date: due_date || null,
        project_id: project_id || null,
      })
      mutateWorkItems()
      toast.success('已新增')
      setText('')
      setOverride({})
      setAdvOpen(false)
      inputRef.current?.focus()
    } catch (err) {
      toast.error('新增失敗：' + err.message)
    }
    setSaving(false)
  }

  function onKeyDown(e) {
    // 中文輸入法組字中的 Enter 是在選字，不能當送出
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  const projectName =
    projects.find((p) => p.id === project_id)?.name || parsed.project_name

  const showChips = text.trim().length > 0 && (due_date || priority || projectName || parsed.location)

  return (
    <div className="basis-full md:basis-0 md:flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          enterKeyHint="done"
          placeholder="打一句話新增待辦，例：明天 #世曦 換硬碟！"
          className="flex-1 min-w-0 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={() => setAdvOpen((v) => !v)}
          className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors ${
            advOpen ? 'bg-gray-200 text-gray-700' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          }`}
          title="進階：優先權／到期日／案件"
        >⚙</button>
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="flex-shrink-0 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
          title="新增（Enter）"
        >{saving ? '…' : '＋'}</button>
      </div>

      {/* 解析結果 —— 讓人看得到系統聽懂了什麼 */}
      {showChips && (
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 px-0.5">
          {due_date && <QuickChip icon="📅" text={due_date} />}
          {projectName && <QuickChip icon="📁" text={projectName} />}
          {priority && <QuickChip icon="⚡" text={priority} />}
          {parsed.location && <QuickChip icon="📍" text={parsed.location} />}
        </div>
      )}

      {/* 進階設定 —— 平常收起來 */}
      {advOpen && (
        <div className="mt-2 p-3 bg-gray-50 rounded-xl space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-12 flex-shrink-0">優先權</span>
            <div className="flex gap-1">
              {PRIORITY_OPTIONS.map((p) => (
                <button key={p}
                  onClick={() => setOverride((o) => ({ ...o, priority: o.priority === p ? undefined : p }))}
                  className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                    priority === p ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' : 'bg-white text-gray-500 hover:bg-gray-100'
                  }`}
                >{p}</button>
              ))}
              <span className="text-xs text-gray-300 self-center ml-1">未選＝中</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-12 flex-shrink-0">到期日</span>
            <input type="date" value={due_date || ''}
              onChange={(e) => setOverride((o) => ({ ...o, due_date: e.target.value || null }))}
              className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-12 flex-shrink-0">案件</span>
            <select value={project_id || ''}
              onChange={(e) => setOverride((o) => ({ ...o, project_id: e.target.value || null }))}
              className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white">
              <option value="">不指定</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            句子裡也可以直接寫：明天／下週三／9-12／月底、#案件、@地點、結尾加！＝高優先
          </p>
        </div>
      )}
    </div>
  )
}

function QuickChip({ icon, text }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">
      <span>{icon}</span>{text}
    </span>
  )
}

function PendingPanel() {
  const {
    pendingItems, overdueCount, isReadOnly, teamMode, userNameMap,
    projects, filterProjectId, handleProjectClick,
    openWiModal, handleCompleteItem, PROJECT_TYPE_ICON,
  } = useWork()

  const { open, close, toggle, triggerProps, panelProps } = useHoverOverlay()
  const [completingItem, setCompletingItem] = useState(null)
  const [completionDate, setCompletionDate] = useState('')

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  // Esc 關閉
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  // 依案件分組，組內依到期日排序；快到期／逾期的案件排前面
  const groups = useMemo(() => {
    const projectMap = {}
    for (const p of projects) projectMap[p.id] = p

    const map = new Map()
    for (const wi of pendingItems) {
      const key = wi.project_id || '_none'
      if (!map.has(key)) {
        const p = projectMap[wi.project_id] || wi.projects
        map.set(key, {
          key,
          id: wi.project_id || null,
          name: (p && p.name) || '未指定案件',
          type: (p && p.type) || null,
          items: [],
        })
      }
      map.get(key).items.push(wi)
    }

    const list = [...map.values()]
    for (const g of list) {
      g.items.sort((a, b) => {
        const oa = dueMeta(a.due_date, todayStr).order
        const ob = dueMeta(b.due_date, todayStr).order
        if (oa !== ob) return oa - ob
        return (a.name || '').localeCompare(b.name || '')
      })
      g.overdue = g.items.filter((wi) => wi.due_date && wi.due_date < todayStr).length
      g.earliest = g.items.length > 0 ? dueMeta(g.items[0].due_date, todayStr).order : 99999
    }
    list.sort((a, b) => {
      if (a.key === '_none') return 1
      if (b.key === '_none') return -1
      if (a.earliest !== b.earliest) return a.earliest - b.earliest
      return b.items.length - a.items.length
    })
    return list
  }, [pendingItems, projects, todayStr])

  function handleCheckClick(e, wi) {
    e.stopPropagation()
    if (isReadOnly) { toast.error('唯讀模式：不能修改他人資料'); return }
    setCompletionDate(format(new Date(), 'yyyy-MM-dd'))
    setCompletingItem(wi)
  }

  function handleConfirmComplete() {
    if (!completionDate || !completingItem) return
    handleCompleteItem(completingItem, completionDate)
    setCompletingItem(null)
  }

  return (
    <>
      {/* ── 底部列（永遠在）───────────────────────────── */}
      <div className="border-t border-gray-200 bg-white flex-shrink-0">
        <div className="flex flex-wrap items-center gap-2 px-3 md:px-5 py-2.5">
          {/* hover 只掛在這顆摘要鈕上，不掛整條列 —— 不然滑鼠移去
              快速輸入框打字時整頁時間軸會一直彈出來擋路 */}
          <button
            {...triggerProps}
            onClick={toggle}
            className="flex items-center gap-3 min-w-0 px-1 py-1 rounded-lg hover:bg-gray-50 transition-colors"
            title={open ? '收合待辦' : '展開待辦時間軸'}
          >
            <span className="text-sm flex-shrink-0">{open ? '▼' : '▲'}</span>
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">待完成事項</span>
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {pendingItems.length} 項
              {overdueCount > 0 && <span className="text-red-500 ml-1">（逾期 {overdueCount} 項）</span>}
            </span>
          </button>
          {!isReadOnly && <QuickAddBar />}
        </div>
      </div>

      {/* ── 整頁時間軸 ─────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <div
            {...panelProps}
            className="absolute inset-x-0 bottom-0 top-12 md:top-14 bg-white md:rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* 標頭 */}
            <div className="flex items-center justify-between gap-2 px-3 md:px-6 py-3 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-base font-bold text-gray-800 whitespace-nowrap">待辦時間軸</span>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {groups.length} 案件 · {pendingItems.length} 項
                  {overdueCount > 0 && <span className="text-red-500 ml-1">（逾期 {overdueCount} 項）</span>}
                </span>
                {filterProjectId && (
                  <button onClick={() => handleProjectClick(filterProjectId)}
                    className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors whitespace-nowrap"
                  >✕ 取消案件篩選</button>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {!isReadOnly && (
                  <button onClick={() => openWiModal(null)}
                    className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >＋ 新增待辦</button>
                )}
                <button onClick={close}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                  title="關閉"
                >✕</button>
              </div>
            </div>

            {/* 內容 */}
            <div className="flex-1 overflow-auto px-3 md:px-6 py-4">
              {groups.length === 0 ? (
                <p className="text-sm text-gray-300 py-16 text-center">沒有待完成項目 🎉</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {groups.map((g) => (
                    <section key={g.key} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-base">{PROJECT_TYPE_ICON[g.type] || '📁'}</span>
                        <span className="text-sm font-bold text-gray-800 truncate">{g.name}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0 ml-auto">
                          {g.items.length} 項
                          {g.overdue > 0 && <span className="text-red-500 ml-1">逾期 {g.overdue}</span>}
                        </span>
                      </div>

                      <ol className="relative ml-1.5 pl-5 border-l-2 border-gray-200 space-y-2">
                        {g.items.map((wi) => {
                          const meta = dueMeta(wi.due_date, todayStr)
                          const tone = DUE_TONE[meta.tone]
                          return (
                            <li key={wi.id} className="relative">
                              <span className={`absolute -left-[1.65rem] top-3 w-2.5 h-2.5 rounded-full ring-2 ring-white ${tone.dot}`} />
                              <div
                                onClick={() => openWiModal(wi)}
                                className="bg-white rounded-lg px-3 py-2 cursor-pointer transition-colors hover:ring-1 hover:ring-blue-300 hover:bg-blue-50/40"
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-xs ${tone.text}`}>{meta.label}</span>
                                  {teamMode && wi.user_id && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 font-medium">
                                      {userNameMap[wi.user_id] || '?'}
                                    </span>
                                  )}
                                  <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_BADGE[wi.priority] || ''}`}>{wi.priority}</span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_BADGE[wi.status] || ''}`}>{wi.status}</span>
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="flex-1 text-sm text-gray-700 break-words">{wi.name}</span>
                                  {!isReadOnly && (
                                    <button onClick={(e) => handleCheckClick(e, wi)}
                                      className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-green-500 hover:bg-green-100 hover:text-green-700 transition-colors text-base"
                                      title="標記完成"
                                    >✓</button>
                                  )}
                                </div>
                              </div>
                            </li>
                          )
                        })}
                      </ol>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 快速完成 popup */}
      {completingItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setCompletingItem(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-72 p-5">
            <p className="text-sm font-bold text-gray-800 mb-1">標記完成</p>
            <p className="text-xs text-gray-500 mb-4 truncate">「{completingItem.name}」</p>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">完成日期</label>
            <input type="date" value={completionDate}
              onChange={(e) => setCompletionDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setCompletingItem(null)}
                className="flex-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
              <button onClick={handleConfirmComplete}
                className="flex-1 px-3 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors">確認完成</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}


/* ================================================================
   VisibilityModal — 案件顯示/隱藏設定
   ================================================================ */

function VisibilityModal() {
  const { handleVisibilityClose, PROJECT_TYPE_ICON } = useWork()
  const { user, profile } = useAuth()

  const [allowedProjects, setAllowedProjects] = useState([])
  const [hiddenIds, setHiddenIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const allowed = await getAllowedProjects(user.id)
        setAllowedProjects(allowed)
        setHiddenIds(profile?.hidden_projects || [])
      } catch (err) {
        console.warn('[VisibilityModal] 載入失敗:', err.message)
        toast.error('載入失敗')
      }
      setLoading(false)
    }
    load()
  }, [user?.id, profile])

  function toggleProject(pid) {
    setHiddenIds((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
    )
  }

  function handleSelectAll() { setHiddenIds([]) }
  function handleDeselectAll() { setHiddenIds(allowedProjects.map((p) => p.id)) }

  async function handleSave() {
    setSaving(true)
    try {
      const validHidden = hiddenIds.filter((id) => allowedProjects.some((p) => p.id === id))
      await updateHiddenProjects(user.id, validHidden)
      toast.success('案件顯示設定已儲存')
      handleVisibilityClose()
    } catch (err) {
      toast.error('儲存失敗：' + err.message)
    }
    setSaving(false)
  }

  const visibleCount = allowedProjects.length - hiddenIds.filter((id) => allowedProjects.some((p) => p.id === id)).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleVisibilityClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-800">案件顯示設定</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              勾選要顯示的案件（{visibleCount}/{allowedProjects.length}）
            </p>
          </div>
          <button onClick={handleVisibilityClose} className="text-gray-400 hover:text-gray-600 text-lg transition-colors">✕</button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <p className="text-center text-gray-400 text-sm py-8">載入中...</p>
          ) : allowedProjects.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">無可用案件</p>
          ) : (
            <>
              <div className="flex gap-2 mb-3">
                <button onClick={handleSelectAll}
                  className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors">全選</button>
                <button onClick={handleDeselectAll}
                  className="text-xs px-2 py-1 bg-gray-50 text-gray-500 rounded hover:bg-gray-100 transition-colors">全不選</button>
              </div>
              <div className="space-y-1">
                {allowedProjects.map((p) => {
                  const isHidden = hiddenIds.includes(p.id)
                  return (
                    <label key={p.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                        isHidden ? 'bg-gray-50 opacity-60' : 'bg-white hover:bg-blue-50'
                      }`}
                    >
                      <input type="checkbox" checked={!isHidden} onChange={() => toggleProject(p.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      <span className="text-base">{PROJECT_TYPE_ICON[p.type] || '📁'}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-800">{p.name}</span>
                        {p.type && <span className="text-xs text-gray-400 ml-2">{p.type}</span>}
                        {p.clients && p.clients.length > 0 && (
                          <p className="text-xs text-gray-400 truncate">{p.clients.map((c) => c.name).join('、')}</p>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            </>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={handleVisibilityClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">取消</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >{saving ? '儲存中...' : '儲存'}</button>
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   ProjectModal — 新增/編輯案件
   ================================================================ */

function ProjectModal({ mode, project, onClose }) {
  const { PROJECT_TYPE_ICON, TYPE_OPTIONS, TYPE_NEEDS_CLIENT } = useWork()
  const isEdit = mode === 'edit'
  const [form, setForm] = useState({ name: '', type: '', notes: '', selectedClientIds: [] })
  const [saving, setSaving] = useState(false)
  const { data: clients } = useSWR('clients', getClients)

  useEffect(() => {
    if (isEdit && project) {
      setForm({
        name: project.name || '', type: project.type || '', notes: project.notes || '',
        selectedClientIds: (project.clients || []).map((c) => c.id),
      })
    }
  }, [isEdit, project])

  function handleChange(f, v) { setForm((prev) => ({ ...prev, [f]: v })) }

  function handleTypeChange(t) {
    const u = { type: t }
    if (t === '世曦攝影機') {
      const sx = (clients || []).find((c) => c.name === '世曦')
      u.selectedClientIds = sx ? [sx.id] : []
    } else if (t === '日常工作') {
      u.selectedClientIds = []
    } else if (t !== form.type) {
      u.selectedClientIds = []
    }
    setForm((prev) => ({ ...prev, ...u }))
  }

  function toggleClient(cid) {
    setForm((prev) => ({
      ...prev,
      selectedClientIds: prev.selectedClientIds.includes(cid)
        ? prev.selectedClientIds.filter((id) => id !== cid)
        : [...prev.selectedClientIds, cid],
    }))
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('案件名稱不可為空'); return }
    setSaving(true)
    try {
      if (isEdit) {
        await updateProject(project.id, { name: form.name.trim(), type: form.type || null, notes: form.notes || null })
        await updateProjectClients(project.id, form.selectedClientIds)
        toast.success('案件已更新')
      } else {
        const created = await createProject({ name: form.name.trim(), type: form.type || null, notes: form.notes || null })
        if (form.selectedClientIds.length > 0) await updateProjectClients(created.id, form.selectedClientIds)
        toast.success('案件已新增')
      }
      onClose()
    } catch (err) { toast.error('儲存失敗：' + err.message) }
    setSaving(false)
  }

  const showClientSelect = TYPE_NEEDS_CLIENT[form.type]
  const isAutoClient = form.type === '世曦攝影機'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">{isEdit ? '編輯案件' : '新增案件'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg transition-colors">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">案件名稱 <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={(e) => handleChange('name', e.target.value)} placeholder="輸入案件名稱"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">分類</label>
            <div className="flex gap-2 flex-wrap">
              {TYPE_OPTIONS.map((t) => (
                <button key={t} type="button" onClick={() => handleTypeChange(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    form.type === t ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-300' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                  }`}
                >{PROJECT_TYPE_ICON[t]} {t}</button>
              ))}
            </div>
          </div>
          {showClientSelect && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                {isAutoClient ? '客戶（自動）' : '選擇客戶'}
              </label>
              <div className="max-h-40 overflow-auto border border-gray-200 rounded-lg p-2 space-y-1">
                {(clients || []).map((c) => (
                  <label key={c.id} className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-gray-50 ${isAutoClient ? 'opacity-50 pointer-events-none' : ''}`}>
                    <input type="checkbox" checked={form.selectedClientIds.includes(c.id)} onChange={() => toggleClient(c.id)} disabled={isAutoClient}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600" />
                    <span className="text-sm text-gray-700">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">備註</label>
            <textarea value={form.notes} rows={2} onChange={(e) => handleChange('notes', e.target.value)} placeholder="備註..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">取消</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >{saving ? '儲存中...' : '儲存'}</button>
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   WorkItemModal — 新增/編輯待辦工作項目
   ================================================================ */

function WorkItemModal() {
  const {
    wiModalItem: item, handleWiModalClose: onClose,
    projects, STATUS_OPTIONS, PRIORITY_OPTIONS,
  } = useWork()

  const isEdit = !!item
  const [form, setForm] = useState({
    name: '', status: '待處理', priority: '中', due_date: '', project_id: '', completion_date: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isEdit && item) {
      setForm({
        name: item.name || '', status: item.status || '待處理', priority: item.priority || '中',
        due_date: item.due_date || '', project_id: item.project_id || '',
        completion_date: format(new Date(), 'yyyy-MM-dd'),
      })
    }
  }, [isEdit, item])

  function handleChange(f, v) { setForm((prev) => ({ ...prev, [f]: v })) }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('名稱不可為空'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        status: form.status,
        priority: form.priority,
        due_date: form.due_date || null,
        project_id: form.project_id || null,
      }

      if (form.status === '已完成' && form.completion_date) {
        let log = await getLogByDate(form.completion_date)
        if (!log) {
          log = await createLog({ log_date: form.completion_date, work_type: '內勤' })
          toast('已自動建立 ' + form.completion_date + ' 日誌', { icon: '📝' })
        }
        payload.log_id = log.id
      }

      if (isEdit) {
        await updateWorkItem(item.id, payload)
        toast.success('已更新')
      } else {
        await createWorkItem(payload)
        toast.success('已新增')
      }
      onClose()
    } catch (err) { toast.error('儲存失敗：' + err.message) }
    setSaving(false)
  }

  async function handleDelete() {
    if (!isEdit) return
    if (!window.confirm(`確定要刪除「${item.name}」嗎？`)) return
    try {
      await deleteWorkItem(item.id)
      toast.success('已刪除')
      onClose()
    } catch (err) { toast.error('刪除失敗：' + err.message) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">{isEdit ? '編輯工作項目' : '新增待辦'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg transition-colors">✕</button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">名稱 <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={(e) => handleChange('name', e.target.value)}
              placeholder="輸入工作內容"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">狀態</label>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map((s) => (
                <button key={s} type="button" onClick={() => handleChange('status', s)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    form.status === s
                      ? s === '已完成' ? 'bg-green-100 text-green-700 ring-1 ring-green-300'
                      : s === '進行中' ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                      : s === '擱置' ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300'
                      : 'bg-gray-100 text-gray-700 ring-1 ring-gray-300'
                      : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                  }`}
                >{s}</button>
              ))}
            </div>
          </div>

          {form.status === '已完成' && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">完成日期（關聯到該日誌）</label>
              <input type="date" value={form.completion_date}
                onChange={(e) => handleChange('completion_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">優先級</label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((p) => (
                <button key={p} type="button" onClick={() => handleChange('priority', p)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.priority === p
                      ? p === '高' ? 'bg-red-100 text-red-700 ring-1 ring-red-300'
                      : p === '中' ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300'
                      : 'bg-gray-100 text-gray-600 ring-1 ring-gray-300'
                      : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                  }`}
                >{p}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">到期日</label>
            <input type="date" value={form.due_date} onChange={(e) => handleChange('due_date', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">關聯案件</label>
            <select value={form.project_id} onChange={(e) => handleChange('project_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— 無 —</option>
              {(projects || []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.type ? ` (${p.type})` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          {isEdit ? (
            <button onClick={handleDelete} className="text-sm text-red-500 hover:text-red-700 transition-colors">刪除</button>
          ) : <div />}
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">取消</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >{saving ? '儲存中...' : '儲存'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
