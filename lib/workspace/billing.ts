import { MARKETS, type MarketPricing } from "@sme-scanner/region";

import { billingRepository } from "@/lib/repositories/billing";
import {
  deliveryAllowanceForTier,
  type WorkspaceTier,
} from "@/lib/workspace/entitlement";
import {
  currentPeriod,
  type UsageSummary,
  type WorkspaceContext,
} from "@/lib/workspace/queries";

/**
 * Billing read model for `/settings/billing` and `GET /api/workspaces/[id]/usage`
 * (CLAUDE.md §3.10, Phase 4 item 5). Reads only: tier changes arrive through
 * the Stripe webhook or a staff grant, never from this module.
 */

export interface TierEvent {
  id: string;
  tier: string;
  source: "stripe_webhook" | "staff_grant" | string;
  stripeEventId: string | null;
  createdAt: string;
}

export interface BillingModel {
  tier: WorkspaceTier;
  usage: UsageSummary;
  /** Last 10 `workspace_tier_events`, newest first. */
  tierEvents: TierEvent[];
  /** Whether a Stripe customer exists (the Billing Portal needs one). */
  stripeCustomer: boolean;
  /** The workspace market's list price (one price per market, §5 "Billing"). */
  marketPrice: MarketPricing;
}

export type BillingRepository = ReturnType<typeof billingRepository>;
export async function readUsage(
  db: Pick<BillingRepository, "usage">,
  args: {
    workspaceId: string;
    tier: WorkspaceTier;
    timezone: string;
    now?: Date;
  },
): Promise<UsageSummary> {
  const period = currentPeriod(args.timezone, args.now);
  const row = await db.usage(
    args.workspaceId,
    period,
    deliveryAllowanceForTier(args.tier),
  );
  return {
    period: row.period,
    approvedDeliveries: row.approved_deliveries ?? 0,
    allowance: row.allowance ?? null,
  };
}
export async function listTierEvents(
  db: Pick<BillingRepository, "tierEvents">,
  workspaceId: string,
  limit = 10,
): Promise<TierEvent[]> {
  return (await db.tierEvents(workspaceId, limit)).map((row) => ({
    id: row.id,
    tier: row.tier,
    source: row.source,
    stripeEventId: row.stripe_event_id,
    createdAt: row.created_at,
  }));
}
export async function hasStripeCustomer(
  db: Pick<BillingRepository, "workspace">,
  workspaceId: string,
): Promise<boolean> {
  return Boolean((await db.workspace(workspaceId))?.stripe_customer_id);
}

/** The billing page model. `ctx.usage` is already the lazily-created current-period row. */
export async function getBilling(
  ctx: WorkspaceContext,
  db: BillingRepository = billingRepository(),
): Promise<BillingModel> {
  const [tierEvents, stripeCustomer] = await Promise.all([
    listTierEvents(db, ctx.workspace.id),
    hasStripeCustomer(db, ctx.workspace.id),
  ]);
  return {
    tier: ctx.workspace.tier,
    usage: ctx.usage,
    tierEvents,
    stripeCustomer,
    marketPrice: MARKETS[ctx.workspace.market].pricing,
  };
}
