/** Mirrors the claim_audit_job lease in supabase/migrations/20260821000001_widen_claim_lease.sql. */
export const STALE_AFTER_MS = 30 * 60 * 1000;
/** Mirrors attempt_count < 3 in claim_audit_job. */
export const MAX_ATTEMPTS = 3;