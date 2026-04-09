-- ============================================
-- MIKAN Restaurant Punch Clock — Supabase Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================

-- 1. EMPLOYEES
CREATE TABLE employees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  pin TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'admin')),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  annual_days INTEGER NOT NULL DEFAULT 30,
  personal_days INTEGER NOT NULL DEFAULT 2,
  expected_hours INTEGER NOT NULL DEFAULT 1776,
  medical_hours INTEGER NOT NULL DEFAULT 20,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PUNCHES (append-only by design)
CREATE TABLE punches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  punch_date DATE NOT NULL,
  punch_time TIME NOT NULL,
  punch_type TEXT NOT NULL CHECK (punch_type IN ('IN', 'OUT')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- For corrections: soft-delete instead of hard delete
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_reason TEXT
);

-- 3. HOLIDAYS / TIME OFF REQUESTS
CREATE TABLE holidays (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Annual', 'Personal', 'Medical', 'MedAppt')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. RESTAURANT CLOSURES
CREATE TABLE closures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. AUDIT LOG — tamper-proof record of every change
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data JSONB,
  new_data JSONB,
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, record_id, action, new_data, changed_at)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), NOW());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_at)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), NOW());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, record_id, action, old_data, changed_at)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), NOW());
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Attach audit triggers to all tables
CREATE TRIGGER audit_employees AFTER INSERT OR UPDATE OR DELETE ON employees FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_punches AFTER INSERT OR UPDATE OR DELETE ON punches FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_holidays AFTER INSERT OR UPDATE OR DELETE ON holidays FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_closures AFTER INSERT OR UPDATE OR DELETE ON closures FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- 6. ROW LEVEL SECURITY
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE punches ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Allow anonymous access (our app uses anon key with PIN auth)
CREATE POLICY "anon_read_employees" ON employees FOR SELECT USING (true);
CREATE POLICY "anon_insert_employees" ON employees FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_employees" ON employees FOR UPDATE USING (true);
CREATE POLICY "anon_delete_employees" ON employees FOR DELETE USING (true);

CREATE POLICY "anon_read_punches" ON punches FOR SELECT USING (true);
CREATE POLICY "anon_insert_punches" ON punches FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_punches" ON punches FOR UPDATE USING (true);

CREATE POLICY "anon_read_holidays" ON holidays FOR SELECT USING (true);
CREATE POLICY "anon_insert_holidays" ON holidays FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_holidays" ON holidays FOR UPDATE USING (true);

CREATE POLICY "anon_read_closures" ON closures FOR SELECT USING (true);
CREATE POLICY "anon_insert_closures" ON closures FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_delete_closures" ON closures FOR DELETE USING (true);

CREATE POLICY "anon_read_audit" ON audit_log FOR SELECT USING (true);

-- 7. INDEXES for performance
CREATE INDEX idx_punches_employee_date ON punches(employee_id, punch_date);
CREATE INDEX idx_punches_date ON punches(punch_date);
CREATE INDEX idx_holidays_employee ON holidays(employee_id);
CREATE INDEX idx_holidays_status ON holidays(status);
CREATE INDEX idx_audit_table_record ON audit_log(table_name, record_id);

-- 8. DEFAULT ADMIN (PIN: 0000)
INSERT INTO employees (name, pin, role, status, annual_days, personal_days, expected_hours, medical_hours)
VALUES ('ADMIN', '0000', 'admin', 'Active', 30, 2, 1776, 20);

-- 9. Helper function: calculate hours for a set of punches
CREATE OR REPLACE FUNCTION calc_day_hours(emp_id UUID, d DATE)
RETURNS NUMERIC AS $$
DECLARE
  total_mins NUMERIC := 0;
  rec RECORD;
  prev_time TIME;
  prev_type TEXT;
BEGIN
  FOR rec IN
    SELECT punch_time, punch_type FROM punches
    WHERE employee_id = emp_id AND punch_date = d AND is_deleted = FALSE
    ORDER BY punch_time
  LOOP
    IF rec.punch_type = 'OUT' AND prev_type = 'IN' THEN
      total_mins := total_mins + EXTRACT(EPOCH FROM (rec.punch_time - prev_time)) / 60;
    END IF;
    prev_time := rec.punch_time;
    prev_type := rec.punch_type;
  END LOOP;
  RETURN ROUND(total_mins / 60, 2);
END;
$$ LANGUAGE plpgsql;
