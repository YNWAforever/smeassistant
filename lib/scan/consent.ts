import { resolveConsentPolicyVersion } from "@/lib/leads/consent";
import type { Locale } from "@/lib/locale";

/**
 * Scan-time consent (CLAUDE.md guardrail 13: "the free scan collects public
 * evidence; unlock/claim require separate explicit consent").
 *
 * The step-4 checkbox in the scan wizard used to be a client-side guard only:
 * a direct POST to /api/scan/start could start a scan with no consent recorded
 * anywhere. This module is the server-side contract.
 *
 * It writes into the existing `consent_records` table rather than a new one.
 * `consent_type` is bare `text NOT NULL` with no CHECK, `lead_id` is nullable
 * (no lead exists at scan time), and `consent_records_job_id_idx` already
 * indexes the dispatch-gate lookup -- so no migration is needed, which is
 * decisive: scripts/neon/catalog.ts::verifyCatalog deep-equals the entire
 * table/column/constraint/index catalog against a frozen snapshot with no
 * allowlist for any of them, so a new column or table would fail db:verify.
 *
 * No `server-only` import: the version constant is also read by the server
 * component that renders the wizard, so the client can echo back the exact
 * version the page showed.
 */
export const SCAN_CONSENT_TYPE = "public_evidence" as const;

export interface ScanConsentRecord {
  consentType: typeof SCAN_CONSENT_TYPE;
  granted: true;
  policyVersion: string;
  locale: Locale;
}

export function currentScanConsentPolicyVersion(env: NodeJS.ProcessEnv = process.env): string {
  return resolveConsentPolicyVersion(env.REPORT_CONSENT_POLICY_VERSION);
}

export type ScanConsentParse =
  | { ok: true; consent: ScanConsentRecord }
  | { ok: false; error: string; status: 400 | 409 };

/**
 * The policy version stamped on the row is always the server-resolved one --
 * never the client's string. The client value is only ever compared, so a
 * caller cannot invent a version that was never published.
 */
export function parseScanConsent(body: Record<string, unknown>, locale: Locale, env: NodeJS.ProcessEnv = process.env): ScanConsentParse {
  if (body.public_evidence_consent !== true) {
    return { ok: false, error: "public evidence consent is required", status: 400 };
  }
  const submitted = body.consent_policy_version;
  if (typeof submitted !== "string" || !submitted.trim()) {
    return { ok: false, error: "consent_policy_version is required", status: 400 };
  }
  const current = currentScanConsentPolicyVersion(env);
  if (submitted.trim() !== current) {
    return { ok: false, error: "consent_policy_stale", status: 409 };
  }
  return { ok: true, consent: { consentType: SCAN_CONSENT_TYPE, granted: true, policyVersion: current, locale } };
}
