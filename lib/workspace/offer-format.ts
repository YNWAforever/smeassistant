/**
 * Offer presentation helpers that are safe in the browser bundle: no server
 * imports. `lib/workspace/offers.ts` pulls in the session/auth module, so a
 * client component takes only types from it and everything it needs to
 * *render* an offer from here.
 *
 * "Expired" is never decided here (it comes from SQL `offer_is_expired`); the
 * stale classification below only reads the `expired` flag the server computed.
 */
export type OfferCurrency = "HKD" | "TWD";

/** The one currency an offer may use in a market. Interface language never changes it (guardrail 11). */
export function marketCurrency(market: "hk" | "tw"): OfferCurrency {
  return market === "tw" ? "TWD" : "HKD";
}

type FormatLocale = "en" | "zh-HK" | "zh-TW";

function intlLocale(locale: FormatLocale): string {
  return locale === "en" ? "en-GB" : locale;
}

/** 1280 -> "HK$1,280"; 1280.5 -> "HK$1,280.50". Null when there is no price. */
export function formatOfferPrice(amount: number | null, currency: OfferCurrency | null, locale: FormatLocale): string | null {
  if (amount === null || currency === null) return null;
  try {
    const whole = Number.isInteger(amount);
    return new Intl.NumberFormat(intlLocale(locale), {
      style: "currency",
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

/** A `YYYY-MM-DD` offer date as a medium date. The value is a calendar date, so it is read as UTC and never shifted. */
export function formatOfferDate(date: string, locale: FormatLocale): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  try {
    return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: "UTC" }).format(parsed);
  } catch {
    return date;
  }
}

/** The three reasons an offer action's drafts can no longer be approved or exported; the server answers with these exact codes. */
export type OfferStaleKind = "offer_changed" | "offer_expired" | "offer_inactive";

export const OFFER_STALE_CODES: readonly OfferStaleKind[] = ["offer_changed", "offer_expired", "offer_inactive"];

export function isOfferStaleCode(value: unknown): value is OfferStaleKind {
  return typeof value === "string" && (OFFER_STALE_CODES as readonly string[]).includes(value);
}

/**
 * Why the offer behind an action no longer matches its drafts, or null when it
 * does. Order matters: an archived or ended offer is the more useful thing to
 * say than a revision mismatch, and a draft-status offer that still carries the
 * confirmed revision's drafts is "not confirmed".
 *
 * `hasVersion` separates "no draft yet" (nothing to be stale) from a draft that
 * recorded no revision at all, which approve/export refuse as changed.
 */
export function offerStaleKind(
  offer: { status: "draft" | "confirmed" | "archived"; expired: boolean; revision: number },
  version: { hasVersion: boolean; recordedRevision: number | null },
): OfferStaleKind | null {
  if (offer.status === "archived") return "offer_inactive";
  if (offer.expired) return "offer_expired";
  if (version.hasVersion && version.recordedRevision !== offer.revision) return "offer_changed";
  if (offer.status !== "confirmed") return "offer_inactive";
  return null;
}
