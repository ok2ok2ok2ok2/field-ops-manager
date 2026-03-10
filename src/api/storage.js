/**
 * Supabase Storage 上傳 API
 * 版本: v1.1
 * 日期: 2025-03-03
 * 檔案: src/api/storage.js
 * 修改: 檔名改用時間戳+副檔名，避免中文路徑 400 錯誤
 */

import { supabase } from '../lib/supabase'

const BUCKET = 'project-attachments'

/**
 * 上傳檔案到 Supabase Storage
 * @param {File} file - 檔案物件
 * @param {string} projectId - 案件 ID
 * @returns {{ url: string, originalName: string }}
 */
export async function uploadFile(file, projectId) {
  const timestamp = Date.now()
  // 只取副檔名，路徑用純英數避免 400
  const ext = file.name.split('.').pop() || 'bin'
  const path = `${projectId}/${timestamp}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
    })

  if (error) throw error

  const { data } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path)

  // 回傳 URL 和原始檔名（顯示用）
  return {
    url: data.publicUrl,
    originalName: file.name,
  }
}

/**
 * 刪除檔案
 * @param {string} url - 檔案公開 URL
 */
export async function deleteFile(url) {
  const bucketUrl = `/storage/v1/object/public/${BUCKET}/`
  const idx = url.indexOf(bucketUrl)
  if (idx === -1) return

  const path = decodeURIComponent(url.substring(idx + bucketUrl.length))

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([path])

  if (error) throw error
}

/**
 * 解析附件列表
 * 格式: [{ url, name }, ...]
 */
export function parseAttachments(raw) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      // 新格式: [{ url, name }]
      if (parsed.length > 0 && typeof parsed[0] === 'object') return parsed
      // 舊格式: [url, url, ...]
      return parsed.map((u) => ({ url: u, name: '附件' }))
    }
    return [{ url: raw, name: '附件' }]
  } catch {
    return raw.trim() ? [{ url: raw.trim(), name: '附件' }] : []
  }
}

/** 附件列表轉回存儲格式 */
export function stringifyAttachments(items) {
  if (!items || items.length === 0) return null
  return JSON.stringify(items)
}
