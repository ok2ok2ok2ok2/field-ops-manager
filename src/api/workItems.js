/**
 * 工作項目 API — 離線版
 * 版本: v4.0
 * 日期: 2026-03-17
 * 檔案: src/api/workItems.js
 *
 * v4.0：新增 getAllUsersWorkItems / getAllUsersWorkItemsByFilter（boss/admin 檢視全員）
 * v3.0：所有查詢加 user_id 篩選（多使用者）
 * v2.1：修正 saveWorkItemsForLog 重複資料問題
 * v2.0：改為讀寫 IndexedDB
 */

import { getAll, getOne, create, update, remove, getCurrentUserId } from '../lib/offlineApi'
import db from '../lib/offlineDb'

const TABLE = 'work_items'

/* ========== 內部工具：附加 project 資訊 ========== */

async function attachProjects(items) {
  if (items.length === 0) return items
  const projectIds = [...new Set(items.map((i) => i.project_id).filter(Boolean))]
  const projects = projectIds.length > 0
    ? await Promise.all(projectIds.map((id) => db.projects.get(id)))
    : []
  const projectMap = {}
  projects.filter(Boolean).forEach((p) => {
    projectMap[p.id] = { id: p.id, name: p.name, type: p.type }
  })

  return items.map((item) => ({
    ...item,
    projects: item.project_id ? (projectMap[item.project_id] || null) : null,
  }))
}

/* ========== 當前使用者查詢（原有功能） ========== */

/** 看板用：讀取當前使用者的所有工作項目 */
export async function getWorkItems() {
  const uid = await getCurrentUserId()
  const data = await getAll(TABLE, {}, { field: 'updated_at', ascending: false })
  const filtered = data.filter((i) => i.user_id === uid)
  return await attachProjects(filtered)
}

/** 依狀態讀取工作項目（可選 project 篩選） */
export async function getWorkItemsByFilter({ projectId, status } = {}) {
  const uid = await getCurrentUserId()
  let data = await getAll(TABLE)
  data = data.filter((i) => i.user_id === uid)

  if (projectId) data = data.filter((i) => i.project_id === projectId)
  if (status) data = data.filter((i) => i.status === status)

  data.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  return await attachProjects(data)
}

/* ========== 全員查詢（boss/admin 專用） ========== */

/** 讀取全員工作項目（可選 userId 篩選特定人） */
export async function getAllUsersWorkItems(userId = null) {
  const data = await getAll(TABLE, {}, { field: 'updated_at', ascending: false })
  const filtered = userId ? data.filter((i) => i.user_id === userId) : data
  return await attachProjects(filtered)
}

/** 全員依狀態/案件篩選（可選 userId） */
export async function getAllUsersWorkItemsByFilter({ projectId, status, userId } = {}) {
  let data = await getAll(TABLE)
  if (userId) data = data.filter((i) => i.user_id === userId)
  if (projectId) data = data.filter((i) => i.project_id === projectId)
  if (status) data = data.filter((i) => i.status === status)

  data.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  return await attachProjects(data)
}

/* ========== CRUD（不變） ========== */

export async function createWorkItem(item) {
  const record = await create(TABLE, {
    name: item.name,
    description: item.description || null,
    status: item.status || '待處理',
    priority: item.priority || '中',
    due_date: item.due_date || null,
    project_id: item.project_id || null,
    log_id: item.log_id || null,
    sort_order: item.sort_order || 0,
  })
  const [withProject] = await attachProjects([record])
  return withProject
}

export async function updateWorkItem(id, updates) {
  const record = await update(TABLE, id, updates)
  const [withProject] = await attachProjects([record])
  return withProject
}

export async function updateWorkItemStatus(id, status) {
  return await update(TABLE, id, { status })
}

export async function deleteWorkItem(id) {
  await remove(TABLE, id)
}

/* ========== 案件底下的工作項目 ========== */

export async function getWorkItemsByProject(projectId) {
  const uid = await getCurrentUserId()
  const data = await getAll(TABLE, { project_id: projectId })
  const filtered = data.filter((i) => i.user_id === uid)
  filtered.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

  const logIds = [...new Set(filtered.map((i) => i.log_id).filter(Boolean))]
  const logs = logIds.length > 0
    ? await Promise.all(logIds.map((id) => db.daily_logs.get(id)))
    : []
  const logMap = {}
  logs.filter(Boolean).forEach((l) => {
    logMap[l.id] = { log_date: l.log_date, work_type: l.work_type }
  })

  return filtered.map((item) => ({
    ...item,
    daily_logs: item.log_id ? (logMap[item.log_id] || null) : null,
  }))
}

/* ========== 日誌底下的工作項目 ========== */

export async function getWorkItemsByLog(logId) {
  const data = await getAll(TABLE, { log_id: logId })
  data.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  return await attachProjects(data)
}

/** 批次儲存日誌的工作項目（先清除再新增） */
export async function saveWorkItemsForLog(logId, items) {
  const existing = await getAll(TABLE, { log_id: logId })
  for (const row of existing) {
    await remove(TABLE, row.id)
  }

  const validItems = items
    .filter((item) => item.name && item.name.trim() !== '')

  const results = []
  for (let idx = 0; idx < validItems.length; idx++) {
    const item = validItems[idx]
    const record = await create(TABLE, {
      log_id: logId,
      name: item.name.trim(),
      description: item.description?.trim() || null,
      status: item.status || '待處理',
      priority: item.priority || '中',
      due_date: item.due_date || null,
      project_id: item.project_id || null,
      sort_order: idx,
    })
    results.push(record)
  }
  return results
}

/** 讀取多個日誌的工作項目（週視圖用） */
export async function getWorkItemsByLogIds(logIds) {
  if (!logIds || logIds.length === 0) return []

  const all = await getAll(TABLE)
  const data = all.filter((i) => logIds.includes(i.log_id))
  data.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  return await attachProjects(data)
}
