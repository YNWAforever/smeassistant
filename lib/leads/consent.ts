import { LEGAL_POLICY_VERSION } from "../legal/policy";

/**
 * The version stamped onto consent_records.policy_version. Derived from the
 * published policy so the two cannot drift apart when the document changes.
 *
 * NOT the last word: a deployment can override it via
 * REPORT_CONSENT_POLICY_VERSION. That override exists only to replay a historical
 * version during a migration and should be blank in normal operation — setting it
 * in one environment and not another splits the consent record set with no way to
 * tell which text a given row was collected under. Resolve it through
 * resolveConsentPolicyVersion, never by reading the env var directly.
 */
export const CONSENT_POLICY_VERSION = LEGAL_POLICY_VERSION;

/**
 * Resolves the version to stamp, given the raw REPORT_CONSENT_POLICY_VERSION value.
 *
 * Exists because `??` is the wrong operator here and the difference is not
 * academic: apps/web/.env.example ships the key with a blank value and SETUP.md
 * tells every engineer to copy that file to .env.local, so dotenv defines the
 * variable as "" rather than leaving it undefined. `"" ?? fallback` is `""`, which
 * would stamp every consent record with an empty policy_version — precisely the
 * unauditable state this module exists to prevent. A blank or whitespace-only
 * override means "not set".
 */
export function resolveConsentPolicyVersion(override: string | undefined): string {
  const trimmed = override?.trim();
  return trimmed ? trimmed : CONSENT_POLICY_VERSION;
}

export type ConsentType = "report_delivery" | "scan_discussion" | "marketing";

export interface ConsentRecordInput {
  consentType: ConsentType;
  granted: boolean;
  policyVersion: string;
  locale: string;
}

export function buildConsentRecords({
  reportDelivery,
  scanDiscussion = false,
  marketing = false,
  locale,
  policyVersion = CONSENT_POLICY_VERSION,
}: {
  reportDelivery: boolean;
  scanDiscussion?: boolean;
  marketing?: boolean;
  locale: string;
  policyVersion?: string;
}): ConsentRecordInput[] {
  return [
    { consentType: "report_delivery", granted: reportDelivery, policyVersion, locale },
    { consentType: "scan_discussion", granted: scanDiscussion, policyVersion, locale },
    { consentType: "marketing", granted: marketing, policyVersion, locale },
  ];
}
