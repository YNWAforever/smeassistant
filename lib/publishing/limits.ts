import {
  consumeRateLimit,
  defaultRateLimitClient,
  RATE_LIMITS,
  rateLimitBucketKey,
  type RateLimitClient,
  type RateLimitScope,
} from "@/lib/security/rate-limit";

export type PublishLimitKind = "publish" | "targets" | "reconcile" | "delete";

export type PublishLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }
  | { allowed: false; unavailable: true };

const UNAVAILABLE: PublishLimitDecision = { allowed: false, unavailable: true };

/**
 * Consume the GBP publishing limits (spec §2.6) for one request.
 *
 * - `publish` consumes `gbp_publish` (workspace), then `gbp_publish_global`
 *   (`"all"`); a refused workspace bucket does not spend the global one.
 * - `delete` consumes `gbp_publish`; `targets` consumes `gbp_targets`;
 *   `reconcile` consumes `gbp_reconcile` keyed by the delivery id.
 *
 * Keys are `rateLimitBucketKey(scope, id)` with no request fingerprint, so a
 * budget is shared by every member of the workspace whatever network they are
 * on. Fails closed: any limiter failure returns `unavailable` (a 503 at the
 * route) and logs only a category.
 */
export async function consumePublishLimits(
  kind: PublishLimitKind,
  ids: { workspaceId: string; deliveryId?: string },
  client: RateLimitClient = defaultRateLimitClient(),
): Promise<PublishLimitDecision> {
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
    console.error("GBP publish limiter unavailable", { category: "gbp_publish_limiter_unavailable" });
    return UNAVAILABLE;
  }
}

function bucketsFor(
  kind: PublishLimitKind,
  ids: { workspaceId: string; deliveryId?: string },
): Array<[RateLimitScope, string]> {
  switch (kind) {
    case "publish":
      return [["gbp_publish", requireId(ids.workspaceId)], ["gbp_publish_global", "all"]];
    case "delete":
      return [["gbp_publish", requireId(ids.workspaceId)]];
    case "targets":
      return [["gbp_targets", requireId(ids.workspaceId)]];
    case "reconcile":
      return [["gbp_reconcile", requireId(ids.deliveryId)]];
  }
}

/** A missing id would collapse every caller into one bucket; refuse instead. */
function requireId(id: string | undefined): string {
  if (!id) throw new Error("missing rate-limit identifier");
  return id;
}
