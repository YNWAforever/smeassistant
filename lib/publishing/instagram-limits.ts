import {
  consumeRateLimit,
  defaultRateLimitClient,
  RATE_LIMITS,
  rateLimitBucketKey,
  type RateLimitClient,
  type RateLimitScope,
} from "@/lib/security/rate-limit";

/**
 * The Instagram publishing rate limits (P20.2b). Mirror of
 * lib/publishing/limits.ts for the GBP channel: keys carry no request
 * fingerprint, so the budget is shared by every member of the workspace from
 * any network, and every failure fails closed (`unavailable` → 503).
 *
 * - `publish` consumes `instagram_publish` (workspace), then
 *   `instagram_publish_global` ("all"); a refused workspace bucket does not
 *   spend the global one.
 * - `reconcile` consumes `instagram_reconcile` keyed by the delivery id.
 * - `insights` consumes `instagram_insights_pull` keyed by the workspace (P20.3).
 *
 * These are our own guards in front of Meta's 25-posts-per-24h account limit;
 * they are not a substitute for it, and no claim is made that a publish can
 * exceed or exactly track the provider's own counting.
 */
export type InstagramLimitKind = "publish" | "reconcile" | "insights";

export type InstagramLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }
  | { allowed: false; unavailable: true };

const UNAVAILABLE: InstagramLimitDecision = { allowed: false, unavailable: true };

export async function consumeInstagramPublishLimits(
  kind: InstagramLimitKind,
  ids: { workspaceId: string; deliveryId?: string },
  client: RateLimitClient = defaultRateLimitClient(),
): Promise<InstagramLimitDecision> {
  try {
    for (const [scope, id] of bucketsFor(kind, ids)) {
      const decision = await consumeRateLimit({
        client,
        bucketKey: rateLimitBucketKey(scope, id),
        ...RATE_LIMITS[scope],
      });
      if (!decision.allowed) return { allowed: false, retryAfterSeconds: decision.retryAfterSeconds };
    }
    return { allowed: true };
  } catch {
    console.error("Instagram publish limiter unavailable", { category: "instagram_publish_limiter_unavailable" });
    return UNAVAILABLE;
  }
}

function bucketsFor(kind: InstagramLimitKind, ids: { workspaceId: string; deliveryId?: string }): Array<[RateLimitScope, string]> {
  switch (kind) {
    case "publish":
      return [["instagram_publish", requireId(ids.workspaceId)], ["instagram_publish_global", "all"]];
    case "reconcile":
      return [["instagram_reconcile", requireId(ids.deliveryId)]];
    case "insights":
      return [["instagram_insights_pull", requireId(ids.workspaceId)]];
  }
}

/** A missing id would collapse every caller into one bucket; refuse instead. */
function requireId(id: string | undefined): string {
  if (!id) throw new Error("missing rate-limit identifier");
  return id;
}
