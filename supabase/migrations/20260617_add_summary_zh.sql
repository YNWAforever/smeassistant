-- Cache Chinese (Cantonese) executive summary so it is generated once and reused
ALTER TABLE audit_jobs ADD COLUMN IF NOT EXISTS summary_zh TEXT;
