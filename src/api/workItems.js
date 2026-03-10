/**
 * 工作項目 API (Supabase)
 * 版本: v1.0
 * 日期: 2026-03-06
 * 檔案: src/api/workItems.js
 *
 * 說明：work_items 為看板主角，帶 status/priority
 *       可獨立存在，也可掛在 project 或 daily_log 底下
 */

import { supabase } from '../lib/supabase'

/* ========== 看板用：讀取所有工作項目 ========== */

/** 讀取所有工作項目（含關聯案件 + 客戶） */
export async function getWorkItems() {
  const { data, error } = await supabase
    .from('work_items')
    .select(`
      id, name, description, status, priority, due_date,
      project_id, log_id, sort_order, created_at, updated_at,
      projects:project_id ( id, name, type )
    `)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data || []
}

/** 依狀態讀取工作項目（可選 project 篩選） */
export async function getWorkItemsByFilter({ projectId, status } = {}) {
  let query = supabase
    .from('work_items')
    .select(`
      id, name, description, status, priority, due_date,
      project_id, log_id, sort_order, created_at, updated_at,
      projects:project_id ( id, name, type )
    `)

  if (projectId) query = query.eq('project_id', projectId)
  if (status) query = query.eq('status', status)

  const { data, error } = await query.order('sort_order', { ascending: true })

  if (error) throw error
  return data || []
}

/* ========== CRUD ========== */

/** 新增工作項目 */
export async function createWorkItem(item) {
  const { data, error } = await supabase
    .from('work_items')
    .insert({
      name: item.name,
      description: item.description || null,
      status: item.status || '待處理',
      priority: item.priority || '中',
      due_date: item.due_date || null,
      project_id: item.project_id || null,
      log_id: item.log_id || null,
      sort_order: item.sort_order || 0,
    })
    .select(`
      id, name, description, status, priority, due_date,
      project_id, log_id, sort_order, created_at, updated_at,
      projects:project_id ( id, name, type )
    `)
    .single()

  if (error) throw error
  return data
}

/** 更新工作項目（完整） */
export async function updateWorkItem(id, updates) {
  const { data, error } = await supabase
    .from('work_items')
    .update(updates)
    .eq('id', id)
    .select(`
      id, name, description, status, priority, due_date,
      project_id, log_id, sort_order, created_at, updated_at,
      projects:project_id ( id, name, type )
    `)
    .single()

  if (error) throw error
  return data
}

/** 更新狀態（看板拖拉用） */
export async function updateWorkItemStatus(id, status) {
  const { data, error } = await supabase
    .from('work_items')
    .update({ status })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/** 刪除工作項目 */
export async function deleteWorkItem(id) {
  const { error } = await supabase
    .from('work_items')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/* ========== 案件底下的工作項目 ========== */

/** 讀取某案件的所有工作項目 */
export async function getWorkItemsByProject(projectId) {
  const { data, error } = await supabase
    .from('work_items')
    .select(`
      id, name, description, status, priority, due_date,
      log_id, sort_order, created_at, updated_at,
      daily_logs:log_id ( log_date, work_type )
    `)
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data || []
}

/* ========== 日誌底下的工作項目 ========== */

/** 讀取某日誌的工作項目 */
export async function getWorkItemsByLog(logId) {
  const { data, error } = await supabase
    .from('work_items')
    .select(`
      id, name, description, status, priority, due_date,
      project_id, sort_order, created_at,
      projects:project_id ( id, name, type )
    `)
    .eq('log_id', logId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data || []
}

/** 批次儲存日誌的工作項目（先清除再新增） */
export async function saveWorkItemsForLog(logId, items) {
  // 清除該日誌的舊項目
  const { error: delError } = await supabase
    .from('work_items')
    .delete()
    .eq('log_id', logId)

  if (delError) throw delError

  // 新增（過濾空白）
  const validItems = items
    .filter((item) => item.name && item.name.trim() !== '')
    .map((item, idx) => ({
      log_id: logId,
      name: item.name.trim(),
      description: item.description?.trim() || null,
      status: item.status || '待處理',
      priority: item.priority || '中',
      due_date: item.due_date || null,
      project_id: item.project_id || null,
      sort_order: idx,
    }))

  if (validItems.length > 0) {
    const { error: insError } = await supabase
      .from('work_items')
      .insert(validItems)

    if (insError) throw insError
  }
}

/** 讀取多個日誌的工作項目（週視圖用） */
export async function getWorkItemsByLogIds(logIds) {
  if (!logIds || logIds.length === 0) return []

  const { data, error } = await supabase
    .from('work_items')
    .select(`
      id, name, description, status, priority, due_date,
      log_id, project_id, sort_order,
      projects:project_id ( id, name, type )
    `)
    .in('log_id', logIds)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data || []
}
