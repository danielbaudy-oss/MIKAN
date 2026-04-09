-- ============================================
-- MIKAN — Compliance Update
-- Adds GPS, edit reasons, and correction tracking
-- Run in Supabase SQL Editor
-- ============================================

-- Add GPS columns to punches
ALTER TABLE punches ADD COLUMN IF NOT EXISTS latitude NUMERIC;
ALTER TABLE punches ADD COLUMN IF NOT EXISTS longitude NUMERIC;

-- Add correction tracking columns to punches
ALTER TABLE punches ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE punches ADD COLUMN IF NOT EXISTS edit_reason TEXT;
ALTER TABLE punches ADD COLUMN IF NOT EXISTS original_time TIME;

-- Add inspector access view (read-only summary for labour inspectors)
CREATE OR REPLACE VIEW inspector_report AS
SELECT 
  e.name AS employee_name,
  p.punch_date,
  p.punch_time,
  p.punch_type,
  p.latitude,
  p.longitude,
  p.is_deleted,
  p.deleted_at,
  p.deleted_reason,
  p.edited_at,
  p.edit_reason,
  p.original_time,
  p.created_at AS recorded_at
FROM punches p
JOIN employees e ON e.id = p.employee_id
ORDER BY p.punch_date DESC, p.punch_time;

-- Grant read access to the view
GRANT SELECT ON inspector_report TO anon;
GRANT SELECT ON inspector_report TO authenticated;
