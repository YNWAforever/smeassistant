import { localeToMarket, type Market } from "@sme-scanner/region";

import type { PrototypeLocale } from "@/lib/copy";

/** A `searchParams` value is `string | string[] | undefined`; pages only ever want the first. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * `?market=` arrives as `hk`/`tw` (this app) or `HK`/`TW` (upstream links).
 * Anything else falls back to the locale's default market — never the other way
 * round: the locale only *seeds* the market, it never overrides an explicit
 * choice (CLAUDE.md guardrail 11).
 */
export function resolveMarketParam(value: string | string[] | undefined, locale: PrototypeLocale): Market {
  const lower = firstParam(value)?.trim().toLowerCase();
  if (lower === "hk" || lower === "tw") return lower;
  return localeToMarket(locale);
}
