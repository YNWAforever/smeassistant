import type { SupabaseClient } from "@supabase/supabase-js";
import { MARKETS, type MarketPricing } from "@sme-scanner/region";

import { supabaseServer } from "@/lib/supabase/admin";
import { deliveryAllowanceForTier, type WorkspaceTier } from "@/lib/workspace/entitlement";
import { currentPeriod, type UsageSummary, type WorkspaceContext } from "@/lib/workspace/queries";

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

interface UsageRow {
  period: string;
  approved_deliveries: number | null;
  allowance: number | null;
}

interface TierEventRow {
  id: string;
  tier: string;
  source: string;
  stripe_event_id: string | null;
  created_at: string;
}

/**
 * The usage row for the given period, created lazily with the allowance the
 * tier carries at creation time -- the same lazy pattern as
 * lib/workspace/queries.ts so both readers agree on the row. A concurrent
 * insert loses the race to the primary key and simply re-reads.
 */
export async function readUsage(
  db: SupabaseClient,
  args: { workspaceId: string; tier: WorkspaceTier; timezone: string; now?: Date },
): Promise<UsageSummary> {
  const period = currentPeriod(args.timezone, args.now);
  const read = async (): Promise<UsageRow | null> => {
    const { data, error } = await db
      .from("workspace_usage")
      .select("period, approved_deliveries, allowance")
      .eq("workspace_id", args.workspaceId)
      .eq("period", period)
      .maybeSingle<UsageRow>();
    if (error) throw new Error("workspace_usage read failed");
    return data ?? null;
  };
  let row = await read();
  if (!row) {
    const allowance = deliveryAllowanceForTier(args.tier);
    const { error } = await db.from("workspace_usage").insert({ workspace_id: args.workspaceId, period, allowance });
    if (error && error.code !== "23505") throw new Error("workspace_usage insert failed");
    row = (await read()) ?? { period, approved_deliveries: 0, allowance };
  }
  return { period: row.period, approvedDeliveries: row.approved_deliveries ?? 0, allowance: row.allowance ?? null };
}

export async function listTierEvents(db: SupabaseClient, workspaceId: string, limit = 10): Promise<TierEvent[]> {
  const { data, error } = await db
    .from("workspace_tier_events")
    .select("id, tier, source, stripe_event_id, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<TierEventRow[]>();
  if (error) throw new Error("workspace_tier_events read failed");
  return (data ?? []).map((row) => ({
    id: row.id,
    tier: row.tier,
    source: row.source,
    stripeEventId: row.stripe_event_id,
    createdAt: row.created_at,
  }));
}

export async function hasStripeCustomer(db: SupabaseClient, workspaceId: string): Promise<boolean> {
  const { data, error } = await db
    .from("workspaces")
    .select("stripe_customer_id")
    .eq("id", workspaceId)
    .maybeSingle<{ stripe_customer_id: string | null }>();
  if (error) throw new Error("workspace billing read failed");
  return Boolean(data?.stripe_customer_id);
}

/** The billing page model. `ctx.usage` is already the lazily-created current-period row. */
export async function getBilling(ctx: WorkspaceContext, db: SupabaseClient = supabaseServer()): Promise<BillingModel> {
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
