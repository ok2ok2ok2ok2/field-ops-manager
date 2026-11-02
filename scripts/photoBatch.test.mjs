// node --test scripts/photoBatch.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assignFilesToSlots } from '../src/lib/photoBatch.js'

const f = (name, t) => ({ name, lastModified: t })

test('依拍攝時間排序填入空格', () => {
  const { pairs, overflow } = assignFilesToSlots([f('b', 2), f('a', 1)], ['s1', 's2', 's3'])
  assert.deepEqual(pairs.map(([k, x]) => [k, x.name]), [['s1', 'a'], ['s2', 'b']])
  assert.equal(overflow.length, 0)
})

test('跳過已有照片的格', () => {
  const { pairs } = assignFilesToSlots([f('a', 1), f('b', 2)], ['s1', 's2', 's3'], { s1: { url: 'x' } })
  assert.deepEqual(pairs.map(([k]) => k), ['s2', 's3'])
})

test('空格不夠時回傳剩下的檔案', () => {
  const { pairs, overflow } = assignFilesToSlots([f('a', 1), f('b', 2), f('c', 3)], ['s1', 's2'], { s2: { url: 'x' } })
  assert.deepEqual(pairs.map(([k, x]) => [k, x.name]), [['s1', 'a']])
  assert.deepEqual(overflow.map((x) => x.name), ['b', 'c'])
})

test('空值照片物件（url 為空）視為空格', () => {
  const { pairs } = assignFilesToSlots([f('a', 1)], ['s1'], { s1: { url: '' } })
  assert.equal(pairs.length, 1)
})
