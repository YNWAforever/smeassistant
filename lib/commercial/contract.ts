import { MARKETS, type Market, type MarketPricing } from "@sme-scanner/region";

// Type-only: `WorkspaceTier` is erased at compile time, so importing it here
// does not create a runtime cycle with `lib/workspace/entitlement.ts`, which
// imports `COMMERCIAL_CONTRACT` (a value) from this module.
import type { WorkspaceTier } from "@/lib/workspace/entitlement";

/**
 * The one versioned commercial contract (Master Plan §6 P3.3; design spec
 * §1). Every application-code place that used to hard-code an allowance, a
 * rescan gate or a price now reads it instead, so there is exactly one place
 * to change those terms and exactly one version to bump when they change.
 *
 * One exception: `neon/migrations/0004_atomic_operations.sql`'s
 * `export_output_version` function carries its own copy of the lite
 * allowance (`case when ws_tier = 'paid' then null else 3 end`) for the
 * `workspace_usage` row it lazily creates on first export. Migrations are
 * immutable once shipped, so that literal cannot read this module at
 * runtime; `lib/commercial/contract-migration-drift.test.ts` statically reads
 * the migration file and fails if that literal and this contract's
 * `tiers.lite.deliveryAllowance` ever disagree.
 *
 * `seats: null` means no cap on workspace membership exists or is enforced --
 * do not add one here without also building the enforcement; an unenforced
 * promise is worse than no promise (tests/unhonoured-promises.test.ts guards
 * this).
 *
 * Prices are references onto `@sme-scanner/region`'s `MARKETS`, not copies,
 * so there remains exactly one number per market.
 */
export const COMMERCIAL_CONTRACT = {
  version: "2026-09-baseline",
  period: "calendar_month_workspace_timezone",
  tiers: {
    lite: { deliveryAllowance: 3, rescans: false, seats: null },
    paid: { deliveryAllowance: null, rescans: true, seats: null },
  },
  prices: { hk: MARKETS.hk.pricing, tw: MARKETS.tw.pricing },
} as const satisfies {
  version: string;
  period: string;
  tiers: Record<WorkspaceTier, { deliveryAllowance: number | null; rescans: boolean; seats: null }>;
  prices: Record<Market, MarketPricing>;
};

/**
 * Rights the contract actually grants and the code actually enforces. Keep
 * this in lockstep with `COMMERCIAL_CONTRACT.tiers[*]` -- a right listed here
 * with no corresponding enforced check is an unhonoured promise.
 */
export type CommercialRight = "rescans";

// Own-property check (not `in`/prototype lookup) against the contract's own
// tier keys, so `"toString"` or `"__proto__"` can never be mistaken for a
// known tier.
const CONTRACT_TIER_KEYS = new Set(Object.keys(COMMERCIAL_CONTRACT.tiers));

/**
 * Server policy boundary for tier-gated rights (design spec §1): fails closed
 * for anything other than a tier the contract actually declares -- null,
 * undefined, empty, unknown, or case-mismatched input all read as "not
 * entitled" rather than guessing.
 */
export function tierAllows(tier: string | null | undefined, right: CommercialRight): boolean {
  if (typeof tier !== "string" || !CONTRACT_TIER_KEYS.has(tier)) return false;
  return COMMERCIAL_CONTRACT.tiers[tier as WorkspaceTier][right];
}
