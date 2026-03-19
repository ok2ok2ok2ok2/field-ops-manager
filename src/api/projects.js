/**
 * 案件管理 API — 離線版
 * 版本: v4.0
 * 日期: 2026-03-19
 * 檔案: src/api/projects.js
 *
 * v4.0：新增 getVisibleProjects()（admin限制 + 使用者自訂兩層篩選）
 *       新增 updateHiddenProjects()（更新使用者自訂隱藏）
 * v3.0：改為讀寫 IndexedDB
 */

import { getAll, getOne, create, update, remove, replaceJoin } from '../lib/offlineApi'
import { supabase } from '../lib/supabase'
import db from '../lib/offlineDb'

const TABLE = 'projects'

/* ========== 內部工具：附加關聯客戶 ========== */

async function attachClients(project) {
  const joins = await db.project_clients
    .where('project_id').equals(project.id).toArray()
  const clients = []
  for (const j of joins) {
    const client = await db.clients.get(j.client_id)
    if (client) clients.push({ id: client.id, name: client.name })
  }
  return { ...project, clients, project_clients: undefined }
}

async function attachClientsToList(projects) {
  return await Promise.all(projects.map(attachClients))
}

/* ========== 案件 CRUD ========== */

/** 讀取所有案件（含關聯客戶，排除已封存） */
export async function getProjects() {
  const all = await getAll(TABLE)
  const filtered = all.filter((p) => !p.archived)
  filtered.sort((a, b) => {
    const ta = new Date(b.updated_at).getTime()
    const tb = new Date(a.updated_at).getTime()
    return ta - tb
  })
  return await attachClientsToList(filtered)
}

/**
 * ★ v4.0：取得使用者可見案件（兩層篩選）
 * 第一層：admin 限制（user_projects 有資料 = 被限制）
 * 第二層：使用者自訂隱藏（profiles.hidden_projects）
 *
 * @param {string} userId - 當前使用者 ID
 * @param {object} profile - 當前使用者 profile（含 hidden_projects）
 * @returns {Array} 過濾後的案件列表
 */
export async function getVisibleProjects(userId, profile) {
  // 先拿全部未封存案件
  const allProjects = await getProjects()

  if (!userId) return allProjects

  // ── 第一層：admin 限制 ──
  let allowed = allProjects
  try {
    const { data: userProjects, error } = await supabase
      .from('user_projects')
      .select('project_id')
      .eq('user_id', userId)

    if (!error && userProjects && userProjects.length > 0) {
      // 有資料 = 被限制，只保留被允許的案件
      const allowedIds = new Set(userProjects.map((up) => up.project_id))
      allowed = allProjects.filter((p) => allowedIds.has(p.id))
    }
    // 無資料 = 看全部，不過濾
  } catch (err) {
    console.warn('[Projects] 查詢 user_projects 失敗，顯示全部:', err.message)
  }

  // ── 第二層：使用者自訂隱藏 ──
  const hiddenProjects = profile?.hidden_projects || []
  if (hiddenProjects.length > 0) {
    const hiddenSet = new Set(hiddenProjects)
    allowed = allowed.filter((p) => !hiddenSet.has(p.id))
  }

  return allowed
}

/**
 * ★ v4.0：取得使用者的 admin 允許案件清單（不含自訂隱藏）
 * 用於「顯示/隱藏案件」面板，讓使用者知道哪些是 admin 允許的
 *
 * @param {string} userId - 當前使用者 ID
 * @returns {Array} admin 允許的案件列表（無自訂隱藏過濾）
 */
export async function getAllowedProjects(userId) {
  const allProjects = await getProjects()

  if (!userId) return allProjects

  try {
    const { data: userProjects, error } = await supabase
      .from('user_projects')
      .select('project_id')
      .eq('user_id', userId)

    if (!error && userProjects && userProjects.length > 0) {
      const allowedIds = new Set(userProjects.map((up) => up.project_id))
      return allProjects.filter((p) => allowedIds.has(p.id))
    }
  } catch (err) {
    console.warn('[Projects] 查詢 user_projects 失敗:', err.message)
  }

  return allProjects
}

/**
 * ★ v4.0：更新使用者自訂隱藏案件
 * 直接寫 Supabase profiles.hidden_projects
 *
 * @param {string} userId - 使用者 ID
 * @param {string[]} hiddenIds - 隱藏的案件 ID 陣列
 */
export async function updateHiddenProjects(userId, hiddenIds) {
  const { error } = await supabase
    .from('profiles')
    .update({ hidden_projects: hiddenIds })
    .eq('id', userId)

  if (error) throw error
}

/** 讀取單一案件（含關聯客戶） */
export async function getProject(id) {
  const project = await getOne(TABLE, id)
  if (!project) throw new Error(`案件 id=${id} 不存在`)
  return await attachClients(project)
}

/** 新增案件 */
export async function createProject(project) {
  return await create(TABLE, {
    name: project.name,
    type: project.type || null,
    notes: project.notes || null,
    locations: project.locations || [],
    attachment_url: project.attachment_url || null,
    archived: false,
  })
}

/** 更新案件 */
export async function updateProject(id, updates) {
  const { clients, project_clients, ...projectUpdates } = updates
  return await update(TABLE, id, projectUpdates)
}

/** 刪除案件 */
export async function deleteProject(id) {
  const clientJoins = await db.project_clients
    .where('project_id').equals(id).toArray()
  for (const j of clientJoins) {
    await db.project_clients.delete([j.project_id, j.client_id])
  }
  const deviceJoins = await db.project_devices
    .where('project_id').equals(id).toArray()
  for (const j of deviceJoins) {
    await db.project_devices.delete([j.project_id, j.device_id])
  }
  await remove(TABLE, id)
}

/** 封存/取消封存案件 */
export async function archiveProject(id, archived = true) {
  return await update(TABLE, id, { archived })
}

/* ========== 客戶關聯 (project_clients) ========== */

export async function getProjectClients(projectId) {
  const joins = await db.project_clients
    .where('project_id').equals(projectId).toArray()
  const clients = []
  for (const j of joins) {
    const client = await db.clients.get(j.client_id)
    if (client) clients.push({ id: client.id, name: client.name })
  }
  return clients
}

export async function updateProjectClients(projectId, clientIds) {
  const rows = (clientIds || []).map((clientId) => ({
    project_id: projectId,
    client_id: clientId,
  }))
  await replaceJoin('project_clients', 'project_id', projectId, rows)
}

/* ========== 設備關聯 (project_devices) ========== */

export async function getDevicesByCode(codes) {
  if (!codes || codes.length === 0) return []
  const allDevices = await getAll('devices')
  return allDevices.filter((d) => codes.includes(d.device_code))
}

export async function getProjectDevices(projectId) {
  const joins = await db.project_devices
    .where('project_id').equals(projectId).toArray()
  const devices = []
  for (const j of joins) {
    const device = await db.devices.get(j.device_id)
    if (device) devices.push({ id: device.id, name: device.name, device_code: device.device_code })
  }
  return devices
}

export async function updateProjectDevices(projectId, deviceCodes) {
  const devices = await getDevicesByCode(deviceCodes)
  const rows = devices.map((d) => ({
    project_id: projectId,
    device_id: d.id,
  }))
  await replaceJoin('project_devices', 'project_id', projectId, rows)
}
