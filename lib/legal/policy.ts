/**
 * The version stamped onto every consent_records row, and the version of the
 * published privacy policy. These are deliberately the same constant: a consent
 * record whose policy_version references no published text is unauditable, which
 * is exactly the state the product was in before 2026-07-28.
 *
 * Bump this ONLY together with a substantive change to the legal.* messages.
 * Rows written before 2026-07-28 carry "2026-07-14" and were collected under the
 * three unlock consent checkbox strings alone; that text is preserved verbatim in
 * legal.changelogBody so the historical record stays meaningful.
 */
export const LEGAL_POLICY_VERSION = "2026-07-28";

/** Rendered in order. Each key K requires legal.{K}Heading and legal.{K}Body. */
export const PRIVACY_SECTION_KEYS = [
  "controller",
  "whatWeCollect",
  "thirdPartySources",
  "purpose",
  "sharing",
  "retention",
  "yourRights",
  "takedown",
  "changelog",
] as const;

export const TERMS_SECTION_KEYS = [
  "service",
  "accuracy",
  "acceptableUse",
  "liability",
  "governingLaw",
] as const;

export type PrivacySectionKey = (typeof PRIVACY_SECTION_KEYS)[number];
export type TermsSectionKey = (typeof TERMS_SECTION_KEYS)[number];
