import { getMarketConfig, type Market, type MarketPricing } from "@sme-scanner/region";

/** `?market=` (hk|tw, any case) else the locale's home market — never the UI language alone (guardrail 11). */
export function resolveMarketParam(value: string | null | undefined, locale: string): Market {
  const lower = value?.trim().toLowerCase();
  if (lower === "hk" || lower === "tw") return lower;
  return locale === "zh-TW" ? "tw" : "hk";
}

export function marketPricing(market: Market): MarketPricing {
  return getMarketConfig(market).pricing;
}

/** HK$888 / NT$2,800 — the plan price shown on landing and pricing, bound to MARKETS[market].pricing. */
export function formatMarketPrice(pricing: MarketPricing): string {
  const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(pricing.amount);
  return pricing.currency === "TWD" ? `NT$${amount}` : `HK$${amount}`;
}
