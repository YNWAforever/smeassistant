import type { Market, MarketPricing } from "@sme-scanner/region";

import { COMMERCIAL_CONTRACT } from "@/lib/commercial/contract";

/** `?market=` (hk|tw, any case) else the locale's home market — never the UI language alone (guardrail 11). */
export function resolveMarketParam(value: string | null | undefined, locale: string): Market {
  const lower = value?.trim().toLowerCase();
  if (lower === "hk" || lower === "tw") return lower;
  return locale === "zh-TW" ? "tw" : "hk";
}

/** The one versioned commercial contract's price for this market (lib/commercial/contract.ts). */
export function marketPricing(market: Market): MarketPricing {
  return COMMERCIAL_CONTRACT.prices[market];
}

/** HK$888 / NT$2,800 — the plan price shown on landing and pricing, bound to MARKETS[market].pricing. */
export function formatMarketPrice(pricing: MarketPricing): string {
  const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(pricing.amount);
  return pricing.currency === "TWD" ? `NT$${amount}` : `HK$${amount}`;
}
