/**
 * The columns the subject-access export reads, kept out of the route file.
 *
 * It lives here for the same reason lib/scan/collect-providers.ts does: Next.js
 * route files may export only route handlers and config fields, so a route that
 * exports anything else fails typecheck against the generated .next types.
 *
 * Named and exported so a contract test can check every column against the
 * migration schema. That is not decoration. `report_evidence` has
 * `collection_status`, not `status`; the export shipped asking for `status`,
 * PostgREST rejects the whole query on an unknown column, and every export would
 * have returned 500. Ten green route tests said nothing, because every mocked
 * PostgREST builder in this repo resolves `{ data, error: null }` without ever
 * looking at the string passed to `.select()`. The schema is the only thing that
 * knows, so lib/security/export-column-contract.test.ts reads the schema.
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
