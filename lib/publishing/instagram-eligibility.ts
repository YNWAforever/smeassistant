/**
 * Whether a version may be published to Instagram as a single feed image
 * (Phase 20 P20.2). Pure, so the page can use it to show or hide the action and
 * every route checks it again. Checks run in the order of the reason union and
 * the first failure wins.
 *
 * Deliberately narrow for the first publishing surface:
 * - only the two templates whose content is a feed post (`social-post`,
 *   `offer-instagram-post`); publishing an IG bio or a review reply as a post
 *   would be the wrong content under an approved version's label;
 * - the version's current state must still be `approved` (guardrail 5);
 * - Meta fetches the image itself, so the URL must be public HTTPS. Private
 *   hosts and embedded credentials are refused rather than sent to Meta;
 * - Instagram's caption limit is 2,200 characters.
 */

export type InstagramPublishEligibilityReason =
  | "flag_off"
  | "not_publishable_template"
  | "not_approved"
  | "invalid_image_url"
  | "empty_caption"
  | "caption_too_long";

/** Templates whose approved body is a feed-post caption. */
export const INSTAGRAM_PUBLISHABLE_TEMPLATES: readonly string[] = ["social-post", "offer-instagram-post"];

/** Instagram's caption limit, measured in characters as the owner sees them. */
export const INSTAGRAM_CAPTION_MAX_CHARS = 2200;

const PRIVATE_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "0.0.0.0", "::1", "[::1]"]);
const PRIVATE_IPV4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/** A public HTTPS URL Meta can fetch; the reason is never echoed to the owner. */
export function isPublicHttpsImageUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (!url.hostname) return false;
  const hostname = url.hostname.toLowerCase();
  if (PRIVATE_HOSTNAMES.has(hostname) || PRIVATE_IPV4.test(hostname)) return false;
  return value.length <= 2048;
}

export function instagramPublishEligibility(input: {
  enabled: boolean;
  templateKey: string;
  approvalState: string;
  caption: string;
  imageUrl: string;
}): { ok: true } | { ok: false; reason: InstagramPublishEligibilityReason } {
  if (!input.enabled) return { ok: false, reason: "flag_off" };
  if (!INSTAGRAM_PUBLISHABLE_TEMPLATES.includes(input.templateKey)) return { ok: false, reason: "not_publishable_template" };
  if (input.approvalState !== "approved") return { ok: false, reason: "not_approved" };
  if (!isPublicHttpsImageUrl(input.imageUrl)) return { ok: false, reason: "invalid_image_url" };
  if (input.caption.trim() === "") return { ok: false, reason: "empty_caption" };
  if (Array.from(input.caption).length > INSTAGRAM_CAPTION_MAX_CHARS) return { ok: false, reason: "caption_too_long" };
  return { ok: true };
}
