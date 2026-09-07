/**
 * quickParse 單元測試
 * 版本: v1.0
 * 日期: 2026-09-07
 * 檔案: scripts/quickParse.test.mjs
 *
 * 跑法：node --test scripts/quickParse.test.mjs
 * 基準日一律 2026-09-07（星期一），所有期望值都以此推算。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQuickInput } from '../src/lib/quickParse.js'

const TODAY = '2026-09-07' // 星期一

const PROJECTS = [
  { id: 'p1', name: '世曦攝影機', type: '攝影機' },
  { id: 'p2', name: '坡面監測', type: '監測' },
  { id: 'p3', name: '大台北瓦斯傾斜儀', type: '監測' },
]

function P(text) {
  return parseQuickInput(text, { projects: PROJECTS, today: TODAY })
}

/* ── 日期：相對日 ───────────────────────────────────────── */

test('今天', () => {
  assert.equal(P('今天回報進度').due_date, '2026-09-07')
  assert.equal(P('今天回報進度').name, '回報進度')
})

test('明天 / 後天 / 大後天', () => {
  assert.equal(P('明天換硬碟').due_date, '2026-09-08')
  assert.equal(P('明天換硬碟').name, '換硬碟')
  assert.equal(P('後天巡檢').due_date, '2026-09-09')
  assert.equal(P('大後天巡檢').due_date, '2026-09-10')
})

test('N 天後', () => {
  assert.equal(P('3天後交報告').due_date, '2026-09-10')
  assert.equal(P('3 天後交報告').due_date, '2026-09-10')
  assert.equal(P('10天後交報告').due_date, '2026-09-17')
  assert.equal(P('3天後交報告').name, '交報告')
})

/* ── 日期：星期 ─────────────────────────────────────────── */

test('本週星期幾 = 今天之後最近的那天', () => {
  assert.equal(P('週三開會').due_date, '2026-09-09')
  assert.equal(P('星期三開會').due_date, '2026-09-09')
  assert.equal(P('禮拜三開會').due_date, '2026-09-09')
  assert.equal(P('週日休假').due_date, '2026-09-13')
  assert.equal(P('週三開會').name, '開會')
})

test('講到今天這個星期幾就是今天', () => {
  // 基準日是星期一
  assert.equal(P('週一交件').due_date, '2026-09-07')
})

test('下週星期幾 = 再往後推一週', () => {
  assert.equal(P('下週三開會').due_date, '2026-09-16')
  assert.equal(P('下星期三開會').due_date, '2026-09-16')
  assert.equal(P('下禮拜三開會').due_date, '2026-09-16')
  assert.equal(P('下週一交件').due_date, '2026-09-14')
})

test('下週X 是以「週」算，不是最近那個 X 再加七天', () => {
  // 基準改成星期三：「下週一」是下一週的星期一，不是再往後推一週
  const wed = { projects: PROJECTS, today: '2026-09-09' }
  assert.equal(parseQuickInput('下週一交件', wed).due_date, '2026-09-14')
  assert.equal(parseQuickInput('下週五交件', wed).due_date, '2026-09-18')
  assert.equal(parseQuickInput('下週日休假', wed).due_date, '2026-09-20')
})

test('單獨的「急」與「趕」都不算關鍵字', () => {
  assert.equal(P('急救包補貨').priority, null)
  assert.equal(P('急救包補貨').name, '急救包補貨')
  assert.equal(P('趕快去看一下').priority, null)
})

test('否定詞先判，同句有驚嘆號也以否定為準', () => {
  assert.equal(P('不緊急，有空再看').priority, '低')
  assert.equal(P('不急，有空再看！').priority, '低')
  // 驚嘆號還是要從名稱裡拿掉
  assert.equal(P('不急，有空再看！').name, '有空再看')
})

test('下週末 / 本週末 / 這週末', () => {
  assert.equal(P('下週末巡檢').due_date, '2026-09-19')
  assert.equal(P('本週末巡檢').due_date, '2026-09-12')
  assert.equal(P('這週末巡檢').due_date, '2026-09-12')
  // 「下週末」不可以被拆成「下週」+「末」
  assert.equal(P('下週末巡檢').name, '巡檢')
})

test('下週 / 週末 / 月底', () => {
  assert.equal(P('下週處理').due_date, '2026-09-14') // 下週一
  assert.equal(P('週末巡檢').due_date, '2026-09-12') // 最近的週六
  assert.equal(P('月底結帳').due_date, '2026-09-30')
})

/* ── 日期：明確日期 ─────────────────────────────────────── */

test('M/D 與 M-D', () => {
  assert.equal(P('9/12 巡檢').due_date, '2026-09-12')
  assert.equal(P('9-12 巡檢').due_date, '2026-09-12')
  assert.equal(P('12/25 尾牙').due_date, '2026-12-25')
  assert.equal(P('9/12 巡檢').name, '巡檢')
})

test('M月D日', () => {
  assert.equal(P('9月12日巡檢').due_date, '2026-09-12')
  assert.equal(P('12月25日尾牙').due_date, '2026-12-25')
})

test('只寫 D 日 = 這個月，已過就下個月', () => {
  assert.equal(P('12日巡檢').due_date, '2026-09-12')
  assert.equal(P('3日巡檢').due_date, '2026-10-03')
})

test('日期已過就滾到明年', () => {
  assert.equal(P('1/5 交報告').due_date, '2027-01-05')
})

test('31日 這個月沒有就找下個月', () => {
  // 2026-09 只有 30 天
  assert.equal(P('31日結帳').due_date, '2026-10-31')
})

test('日曆上不存在的日期不解析，原字留著', () => {
  assert.equal(P('9/31 巡檢').due_date, null)
  assert.equal(P('9/31 巡檢').name, '9/31 巡檢')
  assert.equal(P('2/30 巡檢').due_date, null)
  // 2027 不是閏年
  assert.equal(P('2/29 巡檢').due_date, null)
})

test('週末在星期日講是指下一個星期六，不回頭', () => {
  const sun = { projects: PROJECTS, today: '2026-09-13' } // 星期日
  assert.equal(parseQuickInput('週末巡檢', sun).due_date, '2026-09-19')
  const sat = { projects: PROJECTS, today: '2026-09-12' } // 星期六
  assert.equal(parseQuickInput('週末巡檢', sat).due_date, '2026-09-12')
})

/* ── 優先權 ─────────────────────────────────────────────── */

test('驚嘆號 = 高', () => {
  assert.equal(P('換硬碟!').priority, '高')
  assert.equal(P('換硬碟！').priority, '高')
  assert.equal(P('換硬碟!!!').priority, '高')
  assert.equal(P('換硬碟!').name, '換硬碟')
})

test('急 / 緊急 / 急件 = 高', () => {
  assert.equal(P('很急要換硬碟').priority, '高')
  assert.equal(P('緊急換硬碟').priority, '高')
  assert.equal(P('急件換硬碟').priority, '高')
})

test('不急 = 低', () => {
  assert.equal(P('不急，有空再看').priority, '低')
})

test('沒講就是 null，交給呼叫端補預設', () => {
  assert.equal(P('換硬碟').priority, null)
})

test('高雄不會被當成高優先權', () => {
  assert.equal(P('去高雄場勘').priority, null)
  assert.equal(P('去高雄場勘').name, '去高雄場勘')
})

/* ── 案件 ───────────────────────────────────────────────── */

test('#案件名 完全比對', () => {
  const r = P('#世曦攝影機 換硬碟')
  assert.equal(r.project_id, 'p1')
  assert.equal(r.project_name, '世曦攝影機')
  assert.equal(r.name, '換硬碟')
})

test('#案件名 前綴比對', () => {
  assert.equal(P('#世曦 換硬碟').project_id, 'p1')
  assert.equal(P('#坡面 巡檢').project_id, 'p2')
  assert.equal(P('#坡面 巡檢').name, '巡檢')
})

test('# 後面對不到就原字留在名稱裡', () => {
  const r = P('#不存在的案子 巡檢')
  assert.equal(r.project_id, null)
  assert.equal(r.name, '#不存在的案子 巡檢')
})

test('沒有 # 也能從句子裡認出案件名，但字留著', () => {
  const r = P('世曦攝影機的硬碟要換')
  assert.equal(r.project_id, 'p1')
  assert.equal(r.name, '世曦攝影機的硬碟要換')
})

test('案件清單是空的就不比對', () => {
  const r = parseQuickInput('#世曦 換硬碟', { projects: [], today: TODAY })
  assert.equal(r.project_id, null)
})

/* ── 地點 ───────────────────────────────────────────────── */

test('@地點', () => {
  const r = P('@台中港 巡檢')
  assert.equal(r.location, '台中港')
  assert.equal(r.name, '巡檢')
})

test('沒寫地點就是 null', () => {
  assert.equal(P('巡檢').location, null)
})

/* ── 綜合 ───────────────────────────────────────────────── */

test('全部湊在一起', () => {
  const r = P('明天 #世曦 @五股 換 5566 硬碟!')
  assert.equal(r.due_date, '2026-09-08')
  assert.equal(r.priority, '高')
  assert.equal(r.project_id, 'p1')
  assert.equal(r.location, '五股')
  assert.equal(r.name, '換 5566 硬碟')
})

test('多餘空白會收乾淨', () => {
  assert.equal(P('明天    換硬碟   ').name, '換硬碟')
})

test('沒有任何標記就整句當名稱', () => {
  const r = P('把報告寄給客戶')
  assert.equal(r.name, '把報告寄給客戶')
  assert.equal(r.due_date, null)
  assert.equal(r.project_id, null)
  assert.equal(r.location, null)
})

test('空字串不會爆', () => {
  const r = P('')
  assert.equal(r.name, '')
  assert.equal(r.due_date, null)
  assert.equal(r.priority, null)
})

test('只有標記沒有內容，名稱是空字串', () => {
  assert.equal(P('明天').name, '')
})

/* ── hints：給 UI 顯示解析到什麼 ────────────────────────── */

test('hints 逐項列出解析結果', () => {
  const r = P('明天 #世曦 換硬碟!')
  const types = r.hints.map((h) => h.type).sort()
  assert.deepEqual(types, ['date', 'priority', 'project'])
  for (const h of r.hints) assert.equal(typeof h.label, 'string')
})

test('什麼都沒解析到時 hints 是空陣列', () => {
  assert.deepEqual(P('把報告寄給客戶').hints, [])
})

/* ── today 參數 ─────────────────────────────────────────── */

test('today 吃 Date 物件也可以', () => {
  const r = parseQuickInput('明天巡檢', {
    projects: PROJECTS,
    today: new Date(2026, 8, 7),
  })
  assert.equal(r.due_date, '2026-09-08')
})

test('跨月跨年的相對日', () => {
  const r = parseQuickInput('3天後結帳', { projects: PROJECTS, today: '2026-12-30' })
  assert.equal(r.due_date, '2027-01-02')
})
