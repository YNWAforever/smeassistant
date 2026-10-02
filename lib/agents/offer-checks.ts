/**
 * Offer checks for the `promotion_copy` agent (docs/superpowers/specs/2026-10-01-offers-promotion-copy-design.md §2.3).
 *
 * They are acceptance warnings, not gates: the owner is the approver and sees
 * them before approving. Prices are read by value (1,280 and 1280.00 are the
 * same number), never by string, and only a number carrying a currency marker
 * counts as a price, so a phone number or a year is never mistaken for one.
 */

/** What the run reads from the offer row; Task 6 builds it as `ctx.evidence.offer`. */
export interface OfferEvidence {
  title: string;
  details: string;
  terms: string;
  price: { amount: number; currency: "HKD" | "TWD" } | null;
  /** YYYY-MM-DD */
  valid_from: string;
  /** YYYY-MM-DD */
  valid_until: string;
  claims: string[];
  /** Alt text of the linked asset, only when that asset is rights-approved and usable by the action. */
  photo_alt_text: string | null;
}

export type PromotionChannel = "instagram" | "google";

/** The agent reads its channel from the action's template key. */
export function promotionChannel(templateKey: string): PromotionChannel {
  return templateKey === "offer-instagram-post" ? "instagram" : "google";
}

const NUMBER = String.raw`\d[\d,]*(?:\.\d+)?`;
// A prefix marker (HK$, NT$, $, HKD, TWD) or a suffix marker (元, 蚊) makes a number a price. 元旦 is New Year's Day.
const PRICE = new RegExp(String.raw`(?:HK\$|NT\$|US\$|\$|HKD|TWD)\s?(${NUMBER})|(${NUMBER})\s?(?:元(?!旦)|蚊)`, "gi");

function priceValues(body: string): number[] {
  const values: number[] = [];
  for (const match of body.matchAll(PRICE)) {
    const raw = (match[1] ?? match[2]).replace(/,/g, "");
    const value = Number(raw);
    if (Number.isFinite(value)) values.push(value);
  }
  return values;
}

const PRICE_TOLERANCE = 0.005;

/**
 * True when the body states a price the offer does not have: any currency-marked
 * number other than the offer's amount, or no price at all when the offer has
 * one. With no offer price, any price at all is a mismatch.
 */
export function offerPriceMismatch(body: string, offer: OfferEvidence): boolean {
  const prices = priceValues(body);
  if (!offer.price) return prices.length > 0;
  if (prices.length === 0) return true;
  return prices.some((value) => Math.abs(value - offer.price!.amount) > PRICE_TOLERANCE);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;

/** The forms one ISO date can take in a draft; empty when the input is not a real YYYY-MM-DD. */
function dateForms(iso: string): RegExp[] {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) return [];
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return [];
  const m = `0?${month}`;
  const d = `0?${day}`;
  const mon = MONTHS[month - 1];
  return [
    // 2026-10-19 (not inside a longer digit run)
    new RegExp(String.raw`(?<!\d)${parts[1]}-${parts[2]}-${parts[3]}(?!\d)`),
    // 10月19日 / 10月19號
    new RegExp(String.raw`(?<!\d)${m}\s?月\s?${d}\s?[日號号]`),
    // 19/10 (also 19/10/2026)
    new RegExp(String.raw`(?<!\d)${d}\s?/\s?${m}(?!\d)`),
    // 19 Oct, 19th October
    new RegExp(String.raw`(?<!\d)${d}(?:st|nd|rd|th)?\s+${mon}[a-z]*\b`, "i"),
    // Oct 19
    new RegExp(String.raw`\b${mon}[a-z]*\.?\s+${d}(?!\d)`, "i"),
  ];
}

/** True when neither validity date appears in a recognised form (ISO, M月D日, D/M, D MMM). */
export function offerDatesMissing(body: string, offer: OfferEvidence): boolean {
  return ![offer.valid_from, offer.valid_until].some((iso) => dateForms(iso).some((form) => form.test(body)));
}

/** The listed prohibited terms that appear in the body, case-insensitively, as listed. */
export function offerProhibitedHits(body: string, terms: string[]): string[] {
  const haystack = body.toLowerCase();
  return terms.filter((term) => {
    const needle = term.trim().toLowerCase();
    return needle !== "" && haystack.includes(needle);
  });
}
