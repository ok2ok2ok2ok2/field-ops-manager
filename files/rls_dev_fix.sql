-- ============================================================
-- RLS 開發階段修正 — 允許匿名存取
-- 版本: v1.0
-- 日期: 2025-03-03
-- 說明: 開發階段暫時開放 anon 存取，加入登入功能後請移除
-- 移除指令: 搜尋 "dev_anon_access" 刪除所有相關 policy
-- ============================================================

-- 請在 Supabase Dashboard → SQL Editor 貼上執行

CREATE POLICY "dev_anon_access" ON projects
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "dev_anon_access" ON devices
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "dev_anon_access" ON maintenance_records
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "dev_anon_access" ON daily_logs
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "dev_anon_access" ON tasks
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "dev_anon_access" ON project_devices
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "dev_anon_access" ON daily_log_projects
  FOR ALL USING (true) WITH CHECK (true);
