// node --test scripts/twHolidays.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCalendar } from '../src/lib/twHolidays.js'

const row = (date, week, isHoliday, description = '') => ({ date, week, isHoliday, description })

test('有名稱的假日保留', () => {
  const m = parseCalendar([row('20261010', '六', true, '國慶日')])
  assert.deepEqual(m['2026-10-10'], { name: '國慶日', isHoliday: true })
})

test('一般週末與一般平日略過', () => {
  const m = parseCalendar([row('20261107', '六', true), row('20261109', '一', false)])
  assert.equal(Object.keys(m).length, 0)
})

test('週末補班標補班', () => {
  const m = parseCalendar([row('20260131', '六', false)])
  assert.deepEqual(m['2026-01-31'], { name: '補班', isHoliday: false })
})

test('平日放假沒名稱標放假', () => {
  const m = parseCalendar([row('20261026', '一', true)])
  assert.equal(m['2026-10-26'].name, '放假')
})

test('壞資料不炸', () => {
  assert.deepEqual(parseCalendar(null), {})
  assert.deepEqual(parseCalendar([{ date: 'x' }]), {})
})
