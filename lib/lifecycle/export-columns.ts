/**
 * Export column contracts remain independent of route exports. Historical schema
 * tests catch invalid names; actual Neon SQL integration covers the live repository.
 * In particular report_evidence uses collection_status, not status.
 */
export const EXPORT_COLUMNS = {
  audit_jobs:
    "id, business_name, district, industry, region, status, share_slug, overall_score, score_coverage, created_at, completed_at",
  leads:
    "id, whatsapp, email, contact_identifier, preferred_contact_channel, consent_bd_contact, business_objective, created_at",
  consent_records: "id, lead_id, consent_type, granted, policy_version, locale, recorded_at",
  report_access_grants:
    "id, purpose, email_normalized, expires_at, redeemed_at, revoked_at, last_used_at, created_at",
  report_evidence: "id, provider, evidence_type, source_url, captured_at, collection_status, storage_path",
  audit_findings: "id, module, finding_key, severity, score_impact",
} as const;
