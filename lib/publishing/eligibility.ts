/** Why a version cannot be published, in the order the checks run (spec §2.5). */
export type EligibilityReason =
  | "flag_off"
  | "not_review_response"
  | "not_approved"
  | "no_location_listing"
  | "connection_missing"
  | "too_long"
  | "empty_body";

/** Google's limit on a review reply, measured in UTF-8 bytes, not characters. */
export const GBP_REPLY_MAX_BYTES = 4096;

const REVIEW_RESPONSE_TEMPLATE = "review-response";

/**
 * Whether an output version may be published as a Google review reply (spec
 * §2.5). Pure: the page uses it to show or hide the button and every route
 * checks it again. The checks run in the order of `EligibilityReason` and the
 * first failure wins.
 *
 * `connectionActive` is precomputed by the caller: an `active` `google_gbp`
 * connection whose scopes include `GBP_SCOPE_REQUIRED`.
 */
export function publishEligibility(input: {
  enabled: boolean;
  templateKey: string;
  approvalState: string;
  placeId: string | null;
  connectionActive: boolean;
  body: string;
}): { ok: true } | { ok: false; reason: EligibilityReason } {
  if (!input.enabled) return { ok: false, reason: "flag_off" };
  if (input.templateKey !== REVIEW_RESPONSE_TEMPLATE) return { ok: false, reason: "not_review_response" };
  if (input.approvalState !== "approved") return { ok: false, reason: "not_approved" };
  if (!input.placeId) return { ok: false, reason: "no_location_listing" };
  if (!input.connectionActive) return { ok: false, reason: "connection_missing" };
  if (Buffer.byteLength(input.body, "utf8") > GBP_REPLY_MAX_BYTES) return { ok: false, reason: "too_long" };
  if (input.body.trim() === "") return { ok: false, reason: "empty_body" };
  return { ok: true };
}
