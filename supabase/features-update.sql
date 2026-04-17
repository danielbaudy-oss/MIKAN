-- ============================================
-- MIKAN — Features Update
-- Adds: app_config, paid_hours, freeze, progress support
-- Run in Supabase SQL Editor
-- ============================================

-- App Configuration (key-value store)
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT
);

INSERT INTO app_config (key, value) VALUES
  ('RestaurantName', 'MIKAN'),
  ('FreezeDate', ''),
  ('AllowPastPunches', 'true'),
  ('MaxPastDays', '30'),
  ('DuplicateWindowMinutes', '2')
ON CONFLICT (key) DO NOTHING;

-- Paid Hours
CREATE TABLE IF NOT EXISTS paid_hours (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  hours NUMERIC NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit trigger on paid_hours
CREATE TRIGGER audit_paid_hours AFTER INSERT OR UPDATE OR DELETE ON paid_hours FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Audit trigger on app_config
CREATE TRIGGER audit_app_config AFTER INSERT OR UPDATE OR DELETE ON app_config FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Grants
GRANT ALL ON paid_hours TO anon;
GRANT ALL ON paid_hours TO authenticated;
GRANT ALL ON app_config TO anon;
GRANT ALL ON app_config TO authenticated;

-- Disable RLS (matching current setup)
ALTER TABLE paid_hours DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_config DISABLE ROW LEVEL SECURITY;

-- Index
CREATE INDEX IF NOT EXISTS idx_paid_hours_employee ON paid_hours(employee_id);
CREATE INDEX IF NOT EXISTS idx_paid_hours_date ON paid_hours(date);
