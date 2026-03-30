/**
 * 離線資料庫 — Dexie.js (IndexedDB)
 * 版本: v3.0
 * 日期: 2026-03-25
 * 檔案: src/lib/offlineDb.js
 *
 * v3.0：新增 repair_orders 表（送修單）
 * v2.0：daily_logs / work_items 加 user_id 索引（多使用者）
 * v1.0：初版
 */

import Dexie from 'dexie'

const db = new Dexie('FieldOpsManager')

// v1 舊 schema（Dexie 需要保留舊版本才能升級）
db.version(1).stores({
  clients:         'id, name, category, updated_at, _dirty',
  projects:        'id, name, type, archived, updated_at, _dirty',
  devices:         'id, device_code, client_id, updated_at, _dirty',
  daily_logs:      'id, log_date, updated_at, _dirty',
  work_items:      'id, status, priority, project_id, log_id, updated_at, _dirty',
  project_clients: '[project_id+client_id], project_id, client_id, _dirty',
  project_devices: '[project_id+device_id], project_id, device_id, _dirty',
  sync_meta:       'table_name',
  delete_queue:    '++id, table_name, record_id, created_at',
})

// v2 新增 user_id 索引
db.version(2).stores({
  clients:         'id, name, category, updated_at, _dirty',
  projects:        'id, name, type, archived, updated_at, _dirty',
  devices:         'id, device_code, client_id, updated_at, _dirty',
  daily_logs:      'id, log_date, user_id, updated_at, _dirty',
  work_items:      'id, status, priority, project_id, log_id, user_id, updated_at, _dirty',
  project_clients: '[project_id+client_id], project_id, client_id, _dirty',
  project_devices: '[project_id+device_id], project_id, device_id, _dirty',
  sync_meta:       'table_name',
  delete_queue:    '++id, table_name, record_id, created_at',
})

// v3 新增 repair_orders（送修單）
db.version(3).stores({
  clients:         'id, name, category, updated_at, _dirty',
  projects:        'id, name, type, archived, updated_at, _dirty',
  devices:         'id, device_code, client_id, updated_at, _dirty',
  daily_logs:      'id, log_date, user_id, updated_at, _dirty',
  work_items:      'id, status, priority, project_id, log_id, user_id, updated_at, _dirty',
  repair_orders:   'id, device_id, repair_date, user_id, updated_at, _dirty',
  project_clients: '[project_id+client_id], project_id, client_id, _dirty',
  project_devices: '[project_id+device_id], project_id, device_id, _dirty',
  sync_meta:       'table_name',
  delete_queue:    '++id, table_name, record_id, created_at',
})

export default db
