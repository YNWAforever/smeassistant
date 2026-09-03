/**
 * The outcome vocabulary every SerpApi-backed search in this repo shares.
 * Merchant search widens it with its own `INVALID_MAPS_URL`; Instagram search
 * uses it unchanged. Keeping one union means the client's error-copy map covers
 * both without a second lookup table, and the subset relation is enforced by
 * the type system rather than by comment.
 */
export type SerpApiOutcome =
  | "SUCCESS"
  | "NO_RESULTS"
  | "PROVIDER_AUTH_ERROR"
  | "PROVIDER_PERMISSION_ERROR"
  | "PROVIDER_QUOTA_ERROR"
  | "PROVIDER_ERROR"
  | "TIMEOUT"
  | "NETWORK_ERROR";

export type SerpApiHttpCategory = "success" | "auth" | "permission" | "quota" | "server" | "other";

export function serpApiHttpFailure(
  status: number,
): { outcome: SerpApiOutcome; category: SerpApiHttpCategory } | null {
  if (status === 401) return { outcome: "PROVIDER_AUTH_ERROR", category: "auth" };
  if (status === 403) return { outcome: "PROVIDER_PERMISSION_ERROR", category: "permission" };
  if (status === 429) return { outcome: "PROVIDER_QUOTA_ERROR", category: "quota" };
  if (status >= 500) return { outcome: "PROVIDER_ERROR", category: "server" };
  if (status < 200 || status >= 300) return { outcome: "PROVIDER_ERROR", category: "other" };
  return null;
}
