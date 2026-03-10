/**
 * 離線資料庫 — Dexie.js (IndexedDB)
 * 版本: v1.0
 * 日期: 2026-03-10
 * 檔案: src/lib/offlineDb.js
 *
 * 說明：所有資料的本地鏡像，支援離線讀寫
 *       每筆資料額外帶 _dirty 欄位標記是否待同步
 */

import Dexie from 'dexie'

const db = new Dexie('FieldOpsManager')

db.version(1).stores({
  // 主資料表 — 索引欄位（非全部欄位，Dexie 只需索引）
  clients:         'id, name, category, updated_at, _dirty',
  projects:        'id, name, type, archived, updated_at, _dirty',
  devices:         'id, device_code, client_id, updated_at, _dirty',
  daily_logs:      'id, log_date, updated_at, _dirty',
  work_items:      'id, status, priority, project_id, log_id, updated_at, _dirty',

  // 關聯表
  project_clients: '[project_id+client_id], project_id, client_id, _dirty',
  project_devices: '[project_id+device_id], project_id, device_id, _dirty',

  // 同步狀態追蹤
  sync_meta:       'table_name',

  // 刪除佇列（離線刪除時記錄，上線後同步刪除）
  delete_queue:    '++id, table_name, record_id, created_at',
})

export default db