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
const PRICE = new RegExp(String.raw`(HK\$|NT\$|US\$|HKD|TWD|USD|港元|新台幣|美元|\$)\s*(${NUMBER})|(${NUMBER})\s*(港元|新台幣|美元|蚊|元(?!旦))`, "gi");

function priceValues(body: string): Array<{ amount: number; currency: "HKD" | "TWD" | "USD" | null }> {
  const values: Array<{ amount: number; currency: "HKD" | "TWD" | "USD" | null }> = [];
  for (const match of body.matchAll(PRICE)) {
    const raw = (match[2] ?? match[3]).replace(/,/g, "");
    const value = Number(raw);
    const marker = (match[1] ?? match[4]).toUpperCase();
    const currency = ["HK$", "HKD", "港元", "蚊"].includes(marker) ? "HKD"
      : ["NT$", "TWD", "新台幣"].includes(marker) ? "TWD"
      : ["US$", "USD", "美元"].includes(marker) ? "USD" : null;
    if (Number.isFinite(value)) values.push({ amount: value, currency });
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
  return prices.some(value => value.currency !== offer.price!.currency || Math.abs(value.amount - offer.price!.amount) > PRICE_TOLERANCE);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;

/** The forms one ISO date can take in a draft; empty when the input is not a real YYYY-MM-DD. */
function dateParts(iso: string): DateMention | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) return null;
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const value = { year: Number(parts[1]), month, day };
  return validDate(value, value.year) ? value : null;
}

type DateMention = { year: number | null; month: number; day: number };
function validDate(value: DateMention, defaultYear: number | null): boolean {
  const year = value.year ?? defaultYear;
  if (year == null || year < 1000 || year > 9999) return false;
  const date = new Date(Date.UTC(year, value.month-1, value.day));
  return date.getUTCFullYear() === year && date.getUTCMonth()+1 === value.month && date.getUTCDate() === value.day;
}

/** Match complete date tokens once: a wrong explicit year cannot be stripped. */
function dateMentions(body: string): DateMention[] {
  const mentions: DateMention[] = [];
  const occupied: Array<[number, number]> = [];
  const collect = (pattern: RegExp, decode: (match: RegExpMatchArray) => DateMention) => {
    for (const match of body.matchAll(pattern)) {
      const start = match.index!; const end = start+match[0].length;
      if (occupied.some(([a,b]) => start < b && end > a)) continue;
      const date = decode(match);
      const prefix = /[（(]\s*(\d{4})\s*年?\s*[）)]\s*$/.exec(body.slice(0, start));
      const suffix = /^\s*[（(]\s*(\d{4})\s*年?\s*[）)]/.exec(body.slice(end));
      // Adjacent year qualifiers belong to this boundary, not unrelated dates
      // or business-history years elsewhere in the draft. Preserve conflicts.
      for (const qualifier of [prefix, suffix]) {
        if (!qualifier) continue;
        const year = Number(qualifier[1]);
        if (date.year === null) date.year = year;
        else if (date.year !== year) mentions.push({ ...date, year });
      }
      occupied.push([start, end + (suffix?.[0].length ?? 0)]); mentions.push(date);
    }
  };
  collect(/(?<![\d/-])(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?![\d/-])/g, m => ({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }));
  collect(/(?<![\d年])(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日號号]/g, m => ({ year: m[1] ? Number(m[1]) : null, month: Number(m[2]), day: Number(m[3]) }));
  collect(/(?<![\d/])(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?(?![\d/])/g, m => ({ year: m[3] ? Number(m[3]) : null, month: Number(m[2]), day: Number(m[1]) }));
  const monthWords = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
  const monthNumber = (word: string) => MONTHS.indexOf(word.slice(0,3).toLowerCase() as typeof MONTHS[number])+1;
  collect(new RegExp(String.raw`(?<!\d)(\d{1,2})(?:st|nd|rd|th)?\s+(${monthWords})\b\.?(?:\s*,?\s*(\d{2,4})(?!\d))?`, "gi"), m => ({ year: m[3] ? Number(m[3]) : null, month: monthNumber(m[2]), day: Number(m[1]) }));
  collect(new RegExp(String.raw`\b(${monthWords})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{2,4})(?!\d))?(?!\d)`, "gi"), m => ({ year: m[3] ? Number(m[3]) : null, month: monthNumber(m[1]), day: Number(m[2]) }));
  return mentions;
}

/** Both boundaries are required; cross-year dates need explicit years. */
export function offerDatesMissing(body: string, offer: OfferEvidence): boolean {
  const start = dateParts(offer.valid_from); const end = dateParts(offer.valid_until);
  if (!start || !end || offer.valid_from > offer.valid_until) return true;
  const dates = dateMentions(body);
  if (dates.some(date => !validDate(date, start.year))) return true;
  const crossYear = start.year !== end.year;
  const sameDay = (a: DateMention, b: DateMention) => a.month === b.month && a.day === b.day;
  if (dates.some(date => date.year != null && [start,end].some(boundary => sameDay(date,boundary) && date.year !== boundary.year))) return true;
  return ![start,end].every(boundary => dates.some(date => sameDay(date,boundary) && (date.year === boundary.year || (!crossYear && date.year == null))));
}

/** The listed prohibited terms that appear in the body, case-insensitively, as listed. */
export function offerProhibitedHits(body: string, terms: string[]): string[] {
  const haystack = body.toLowerCase();
  return terms.filter((term) => {
    const needle = term.trim().toLowerCase();
    return needle !== "" && haystack.includes(needle);
  });
}
