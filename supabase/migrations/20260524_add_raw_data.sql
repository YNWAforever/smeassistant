-- supabase/migrations/20260524_add_raw_data.sql
ALTER TABLE audit_jobs ADD COLUMN IF NOT EXISTS raw_data JSONB;
