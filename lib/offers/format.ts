import type { OfferCurrency, OfferRow } from "./types";

const SYMBOL: Record<OfferCurrency, string> = { HKD: "HK$", TWD: "NT$" };

/** HK$88, HK$88.50, NT$1,200. Deterministic, never model-written. */
export function formatOfferPrice(amount: string | number, currency: OfferCurrency): string {
  const value = typeof amount === "number" ? amount : Number(amount);
  const cents = Math.round(value * 100) % 100 !== 0;
  const text = value.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  return `${SYMBOL[currency]}${text}`;
}

export function offerPriceDisplay(offer: Pick<OfferRow, "price_amount" | "currency">): string | null {
  return offer.price_amount !== null && offer.currency ? formatOfferPrice(offer.price_amount, offer.currency) : null;
}

/** The validity line every draft must use as written. */
export function validityText(offer: Pick<OfferRow, "starts_on" | "ends_on" | "open_ended">, locale: string): string {
  if (offer.ends_on) return `${offer.starts_on} – ${offer.ends_on}`;
  if (locale === "zh-HK") return `由 ${offer.starts_on} 起，未設結束日期`;
  if (locale === "zh-TW") return `自 ${offer.starts_on} 起，未設結束日期`;
  return `From ${offer.starts_on}, no fixed end date`;
}
