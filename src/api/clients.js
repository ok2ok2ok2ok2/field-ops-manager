/**
 * 客戶管理 API (Supabase)
 * 版本: v1.0
 * 日期: 2025-03-03
 * 檔案: src/api/clients.js
 */

import { supabase } from '../lib/supabase'

/** 讀取所有客戶 */
export async function getClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return data
}

/** 讀取單一客戶 */
export async function getClient(id) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

/** 新增客戶 */
export async function createClient(client) {
  const { data, error } = await supabase
    .from('clients')
    .insert({
      name: client.name,
      category: client.category || null,
      contact_name: client.contact_name || null,
      phone: client.phone || null,
      email: client.email || null,
      contact_notes: client.contact_notes || null,
      payment_date: client.payment_date || null,
      payment_notes: client.payment_notes || null,
      device_count: client.device_count || 0,
      device_codes: client.device_codes || [],
      notes: client.notes || null,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/** 更新客戶 */
export async function updateClient(id, updates) {
  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/** 刪除客戶 */
export async function deleteClient(id) {
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', id)

  if (error) throw error
}
