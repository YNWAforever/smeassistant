export const WORKSPACE_TIERS = ["lite", "paid"] as const;
export type WorkspaceTier = (typeof WORKSPACE_TIERS)[number];

const WORKSPACE_TIER_SET = new Set<string>(WORKSPACE_TIERS);

/**
 * Runtime guard for every boundary that accepts a tier from JSON, Stripe, or
 * the database. Tier strings are authorization inputs: a typo must not become
 * a new paid plan by accident.
 */
export function isWorkspaceTier(value: unknown): value is WorkspaceTier {
  return typeof value === "string" && WORKSPACE_TIER_SET.has(value);
}

const STRIPE_ENTITLED_STATUSES = new Set(["active", "trialing", "past_due"]);
const STRIPE_UNENTITLED_STATUSES = new Set([
  "incomplete",
  "incomplete_expired",
  "canceled",
  "unpaid",
  "paused",
]);

/**
 * Translate Stripe's subscription lifecycle into this product's two-tier
 * entitlement model.
 *
 * `past_due` deliberately keeps access during Stripe's payment-retry window;
 * terminal/non-billing states lose paid access. Unknown or malformed statuses
 * return null so the webhook can fail and retry rather than guessing at a
 * money-moving authorization decision.
 */
export function workspaceTierForStripeSubscriptionStatus(status: unknown): WorkspaceTier | null {
  if (typeof status !== "string") return null;
  if (STRIPE_ENTITLED_STATUSES.has(status)) return "paid";
  if (STRIPE_UNENTITLED_STATUSES.has(status)) return "lite";
  return null;
}

/**
 * Fail closed: a missing workspace, null tier, lookup error, or unknown future
 * tier must never be treated as paid. New paid tiers must be added explicitly
 * to this authorization boundary instead of inheriting access by being merely
 * "not lite".
 */
export function isWorkspacePaid(tier: string | null | undefined): boolean {
  return tier === "paid";
}

/**
 * Local addition (CLAUDE.md §3.10): approved-delivery allowance per period,
 * copied onto `workspace_usage.allowance` when the row is created.
 * `lite` → 3, `paid` → null (unlimited).
 */
export function deliveryAllowanceForTier(tier: WorkspaceTier): number | null {
  return tier === "paid" ? null : 3;
}
