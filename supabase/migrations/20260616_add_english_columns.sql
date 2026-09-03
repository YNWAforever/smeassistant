-- supabase/migrations/20260616_add_english_columns.sql
-- Cache English AI-generated content for /en/r/[slug] report page

ALTER TABLE audit_jobs ADD COLUMN IF NOT EXISTS summary_en TEXT;
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS owner_message_en TEXT;
