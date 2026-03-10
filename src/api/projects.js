/**
 * 案件管理 API (Supabase)
 * 版本: v2.1
 * 日期: 2026-03-10
 * 檔案: src/api/projects.js
 *
 * v2.1 修改：
 *  - getProjects() 預設過濾 archived=false
 *  - 新增 archiveProject() 封存/取消封存
 *
 * v2.0 重構：
 *  - projects 簡化為大分類容器（移除 status/priority/client）
 *  - 客戶改為多對多（project_clients 關聯表）
 *  - 看板主角改為 work_items（見 workItems.js）
 */

import { supabase } from '../lib/supabase'

/* ========== 案件 CRUD ========== */

/** 讀取所有案件（含關聯客戶，排除已封存） */
export async function getProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select(`
      id, name, type, notes, locations, attachment_url, archived,
      created_at, updated_at,
      project_clients ( client_id, clients:client_id ( id, name ) )
    `)
    .eq('archived', false)
    .order('updated_at', { ascending: false })

  if (error) throw error

  // 攤平 clients 結構
  return (data || []).map((p) => ({
    ...p,
    clients: (p.project_clients || []).map((pc) => pc.clients).filter(Boolean),
    project_clients: undefined,
  }))
}

/** 讀取單一案件（含關聯客戶） */
export async function getProject(id) {
  const { data, error } = await supabase
    .from('projects')
    .select(`
      id, name, type, notes, locations, attachment_url, archived,
      created_at, updated_at,
      project_clients ( client_id, clients:client_id ( id, name ) )
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return {
    ...data,
    clients: (data.project_clients || []).map((pc) => pc.clients).filter(Boolean),
    project_clients: undefined,
  }
}

/** 新增案件 */
export async function createProject(project) {
  const { data, error } = await supabase
    .from('projects')
    .insert({
      name: project.name,
      type: project.type || null,
      notes: project.notes || null,
      locations: project.locations || [],
      attachment_url: project.attachment_url || null,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/** 更新案件 */
export async function updateProject(id, updates) {
  // 過濾掉不屬於 projects 表的欄位
  const { clients, project_clients, ...projectUpdates } = updates

  const { data, error } = await supabase
    .from('projects')
    .update(projectUpdates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/** 刪除案件 */
export async function deleteProject(id) {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/** 封存/取消封存案件 */
export async function archiveProject(id, archived = true) {
  const { data, error } = await supabase
    .from('projects')
    .update({ archived })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/* ========== 客戶關聯 (project_clients) ========== */

/** 讀取案件的關聯客戶 */
export async function getProjectClients(projectId) {
  const { data, error } = await supabase
    .from('project_clients')
    .select('client_id, clients:client_id ( id, name )')
    .eq('project_id', projectId)

  if (error) throw error
  return (data || []).map((pc) => pc.clients).filter(Boolean)
}

/** 更新案件的客戶關聯（先清除再新增） */
export async function updateProjectClients(projectId, clientIds) {
  // 清除舊關聯
  const { error: delError } = await supabase
    .from('project_clients')
    .delete()
    .eq('project_id', projectId)

  if (delError) throw delError

  // 新增新關聯
  if (clientIds && clientIds.length > 0) {
    const rows = clientIds.map((clientId) => ({
      project_id: projectId,
      client_id: clientId,
    }))
    const { error: insError } = await supabase
      .from('project_clients')
      .insert(rows)

    if (insError) throw insError
  }
}

/* ========== 設備關聯 (project_devices) ========== */

/** 用 device_code 查設備 ID */
export async function getDevicesByCode(codes) {
  if (!codes || codes.length === 0) return []
  const { data, error } = await supabase
    .from('devices')
    .select('id, name, device_code')
    .in('device_code', codes)

  if (error) throw error
  return data || []
}

/** 讀取案件關聯的設備 */
export async function getProjectDevices(projectId) {
  const { data, error } = await supabase
    .from('project_devices')
    .select('device_id, devices(id, name, device_code)')
    .eq('project_id', projectId)

  if (error) throw error
  return (data || []).map((d) => d.devices).filter(Boolean)
}

/** 更新案件的設備關聯（先清除再新增） */
export async function updateProjectDevices(projectId, deviceCodes) {
  const devices = await getDevicesByCode(deviceCodes)
  const deviceIds = devices.map((d) => d.id)

  const { error: delError } = await supabase
    .from('project_devices')
    .delete()
    .eq('project_id', projectId)

  if (delError) throw delError

  if (deviceIds.length > 0) {
    const rows = deviceIds.map((deviceId) => ({
      project_id: projectId,
      device_id: deviceId,
    }))
    const { error: insError } = await supabase
      .from('project_devices')
      .insert(rows)

    if (insError) throw insError
  }
}
