// 月報表國定假日級距測試 v1.0 / 2026-11-02 — node --test scripts/monthlyReport.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayKind, classifyOvertime, buildReport } from '../src/lib/monthlyReport.js'

const cal = {
  '2026-10-09': { name: '補假', isHoliday: true },     // 五
  '2026-10-25': { name: '光復節', isHoliday: true },   // 日
  '2026-02-07': { name: '補班', isHoliday: false },    // 六 (假設)
}

test('dayKind: 平日假日→saturday, 周日假日→sunday, 補班→weekday, 沒表照星期', () => {
  assert.equal(dayKind('2026-10-09', cal), 'saturday')
  assert.equal(dayKind('2026-10-25', cal), 'sunday')
  assert.equal(dayKind('2026-02-07', cal), 'weekday')
  assert.equal(dayKind('2026-10-09'), 'weekday')
  assert.equal(dayKind('2026-10-10'), 'saturday')
})

test('國定假日 9h 走周六三段', () => {
  assert.deepEqual(classifyOvertime('2026-10-09', 9, 0, cal), [
    { column: 'sat_2', hours: 2 }, { column: 'sat_3to8', hours: 6 }, { column: 'sat_8plus', hours: 1 },
  ])
})

test('buildReport: 國定假日整段外勤算加班, 補班日只算班外', () => {
  const logs = [
    { log_date: '2026-10-09', work_type: '外勤', field_start: '09:00', field_end: '17:00' },
    { log_date: '2026-02-07', work_type: '外勤', field_start: '08:30', field_end: '18:30' },
  ]
  const { overtimes } = buildReport(logs, undefined, cal)
  const hol = overtimes.filter((o) => o.log_date === '2026-10-09')
  assert.equal(hol.length, 1)
  assert.equal(hol[0].hours, 8)
  assert.deepEqual(hol[0].breakdown, [{ column: 'sat_2', hours: 2 }, { column: 'sat_3to8', hours: 6 }])
  const mk = overtimes.filter((o) => o.log_date === '2026-02-07')
  assert.equal(mk.length, 1)
  assert.deepEqual(mk[0].breakdown, [{ column: 'weekday_2', hours: 1 }])
})
