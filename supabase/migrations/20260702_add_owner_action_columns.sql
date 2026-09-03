-- supabase/migrations/20260702_add_owner_action_columns.sql
-- Add owner-facing "what to do" action copy per finding, alongside owner_message_*.

ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS owner_action_zh TEXT;
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS owner_action_en TEXT;
