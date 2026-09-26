import { getMarketCtas, type Market } from "@sme-scanner/region";

// Type-only: erased at compile time, so this stays free of the runtime cycle
// with `lib/workspace/entitlement.ts` that `contract.ts` already avoids.
import type { WorkspaceTier } from "@/lib/workspace/entitlement";
import { COMMERCIAL_CONTRACT } from "@/lib/commercial/contract";
import { billingAvailability } from "@/lib/commercial/availability";
import { t } from "@/lib/i18n";

/**
 * No `import "server-only"` here (design spec §3, Task 4 brief): this module
 * is imported by the client `components/landing-page.tsx` for `allowanceText`
 * and the `PublicBilling` type. `publicBilling()` itself reads `process.env`
 * and must only ever be called from server-rendered route files.
 */

/**
 * The allowance line a public price card shows, read from the one commercial
 * contract (`COMMERCIAL_CONTRACT.tiers[tier].deliveryAllowance`) instead of a
 * second hard-coded number. `null` (paid, today) reads as unlimited.
 */
export function allowanceText(locale: string, tier: WorkspaceTier): string {
  const allowance = COMMERCIAL_CONTRACT.tiers[tier].deliveryAllowance;
  return allowance === null
    ? t(locale, "commercial.unlimitedLine")
    : t(locale, "commercial.allowanceLine", { count: allowance });
}

/** The market's first configured contact channel, or null when none is set. */
export function contactHrefFor(market: Market): string | null {
  return getMarketCtas(market)[0]?.href ?? null;
}

export interface PublicBilling {
  open: boolean;
  contactHref: Record<Market, string | null>;
}

/**
 * Server-only entry point: the one read of `billingAvailability()` and the
 * per-market contact channels that the public pricing and landing pages need
 * to render honestly while billing stays closed. Route files call this and
 * pass the result down as a prop; it must never run in client code.
 */
export function publicBilling(): PublicBilling {
  return {
    open: billingAvailability().open,
    contactHref: { hk: contactHrefFor("hk"), tw: contactHrefFor("tw") },
  };
}
