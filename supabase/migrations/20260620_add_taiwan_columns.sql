-- supabase/migrations/20260620_add_taiwan_columns.sql
-- Cache Taiwan Mandarin AI-generated content for the zh-TW report page,
-- mirroring the English columns added in 20260616_add_english_columns.sql.

ALTER TABLE audit_jobs ADD COLUMN IF NOT EXISTS summary_tw TEXT;
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS owner_message_tw TEXT;

-- Tag which regional deployment created the job (analytics + integrity).
ALTER TABLE audit_jobs ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'hk';
