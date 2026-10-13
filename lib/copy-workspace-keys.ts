/**
 * Key lists and key types for the workspace copy (lib/copy-workspace.ts). This
 * module holds no strings, so client components can import it without pulling
 * every locale's workspace dictionary into the browser bundle.
 */
export type DisplayPhaseKey =
  | "requires_connection"
  | "needs_input"
  | "generating"
  | "draft_ready"
  | "changes_requested"
  | "approved_export_ready"
  | "verified"
  | "applied"
  | "publishing_to_google"
  | "published_on_google"
  | "exported"
  | "awaiting_comparable_scan"
  | "measured"
  | "recommended";

export const DISPLAY_PHASE_KEYS: DisplayPhaseKey[] = [
  "requires_connection",
  "needs_input",
  "generating",
  "draft_ready",
  "changes_requested",
  "approved_export_ready",
  "verified",
  "applied",
  "publishing_to_google",
  "published_on_google",
  "exported",
  "awaiting_comparable_scan",
  "measured",
  "recommended",
];

export const PUBLISH_REASON_KEYS = [
  "already_replied", "connection_expired", "provider_forbidden", "review_not_found", "provider_rate_limited", "provider_unavailable", "not_applied",
  "flag_off", "not_review_response", "not_approved", "no_location_listing", "connection_missing", "too_long", "empty_body",
  "version_changed", "target_not_in_location", "location_not_managed", "already_publishing", "target_busy", "allowance_exceeded",
  "idempotency_key_conflict", "reply_changed_on_google", "delivery_not_published", "not_enabled", "unavailable", "too_soon",
  "rate_limited", "network", "forbidden", "generic",
] as const;
export type PublishReasonKey = (typeof PUBLISH_REASON_KEYS)[number];

export const ACTION_INPUT_KEYS = [
  "brand_voice", "reviews_without_response", "language", "channel", "opening_hours", "categories", "asset_or_text_only", "alt_text",
  "approved_claim", "cta_link", "owner_fact_1", "owner_fact_2", "owner_fact_3", "menu_items", "google_account_owner", "offer_id",
] as const;
