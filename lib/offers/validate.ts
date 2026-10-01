import { z } from "zod";
import { marketCurrency } from "./usability";
import type { OfferInput, OfferInputError, OfferRow } from "./types";

export const OFFER_LIMITS = { title: 120, details: 1000, terms: 1000, claims: 10, claimChars: 200, wording: 20, wordingChars: 100, assets: 4 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Trimmed non-blank strings; blank entries are dropped, not stored. */
function stringList(raw: unknown, maxItems: number, maxChars: number): string[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;
  const items: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > maxChars) return null;
    if (!items.includes(trimmed)) items.push(trimmed);
  }
  return items.length > maxItems ? null : items;
}

function price(raw: unknown): string | null | false {
  if (raw === undefined || raw === null || raw === "") return null;
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : null;
  if (text === null || !/^\d{1,10}(\.\d{1,2})?$/.test(text)) return false;
  return Number(text).toFixed(2);
}

const shape = z.object({
  title: z.unknown(),
  details: z.unknown(),
  terms: z.unknown().optional(),
  price_amount: z.unknown().optional(),
  currency: z.unknown().optional(),
  starts_on: z.unknown(),
  ends_on: z.unknown().optional(),
  open_ended: z.unknown().optional(),
  approved_claims: z.unknown().optional(),
  prohibited_wording: z.unknown().optional(),
  asset_ids: z.unknown().optional(),
  location_id: z.unknown().optional(),
});

/**
 * Validates the owner's offer form. The currency is the workspace market's,
 * set by the server: a body that names another currency is refused, never
 * coerced (Master Plan P4.1, "wrong-market currency").
 */
export function parseOfferBody(
  raw: unknown,
  ctx: { market: "hk" | "tw" },
): { ok: true; offer: OfferInput } | { ok: false; error: OfferInputError } {
  const parsed = shape.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "title_invalid" };
  const body = parsed.data;
  const text = (value: unknown, max: number, optional: boolean): string | null | false => {
    if (value === undefined || value === null) return optional ? null : false;
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    if (!trimmed) return optional ? null : false;
    return trimmed.length > max ? false : trimmed;
  };
  const title = text(body.title, OFFER_LIMITS.title, false);
  if (!title) return { ok: false, error: "title_invalid" };
  const details = text(body.details, OFFER_LIMITS.details, false);
  if (!details) return { ok: false, error: "details_invalid" };
  const terms = text(body.terms, OFFER_LIMITS.terms, true);
  if (terms === false) return { ok: false, error: "terms_invalid" };
  const amount = price(body.price_amount);
  if (amount === false) return { ok: false, error: "price_invalid" };
  const currency = marketCurrency(ctx.market);
  if (body.currency !== undefined && body.currency !== null && body.currency !== "" && body.currency !== currency) {
    return { ok: false, error: "currency_market_mismatch" };
  }
  if (typeof body.starts_on !== "string" || !isCalendarDate(body.starts_on)) return { ok: false, error: "dates_invalid" };
  const endsOn = body.ends_on === undefined || body.ends_on === null || body.ends_on === "" ? null : body.ends_on;
  if (endsOn !== null && (typeof endsOn !== "string" || !isCalendarDate(endsOn) || endsOn < body.starts_on)) {
    return { ok: false, error: "dates_invalid" };
  }
  if (body.open_ended !== undefined && typeof body.open_ended !== "boolean") return { ok: false, error: "dates_invalid" };
  const openEnded = body.open_ended === true;
  if (openEnded && endsOn !== null) return { ok: false, error: "dates_invalid" };
  const claims = stringList(body.approved_claims, OFFER_LIMITS.claims, OFFER_LIMITS.claimChars);
  if (!claims) return { ok: false, error: "claims_invalid" };
  const wording = stringList(body.prohibited_wording, OFFER_LIMITS.wording, OFFER_LIMITS.wordingChars);
  if (!wording) return { ok: false, error: "wording_invalid" };
  const assets = stringList(body.asset_ids, OFFER_LIMITS.assets, 36);
  if (!assets || assets.some((id) => !UUID.test(id))) return { ok: false, error: "assets_invalid" };
  const location = body.location_id === undefined || body.location_id === null || body.location_id === "" ? null : body.location_id;
  if (location !== null && (typeof location !== "string" || !UUID.test(location))) return { ok: false, error: "location_invalid" };
  return {
    ok: true,
    offer: {
      location_id: location,
      title,
      details,
      terms,
      price_amount: amount,
      currency: amount === null ? null : currency,
      starts_on: body.starts_on,
      ends_on: endsOn,
      open_ended: openEnded,
      approved_claims: claims,
      prohibited_wording: wording,
      asset_ids: assets.map((id) => id.toLowerCase()),
    },
  };
}

/** Confirmation needs a deliberate end-date choice and an offer that has not ended. */
export function confirmable(
  offer: Pick<OfferRow, "ends_on" | "open_ended" | "starts_on">,
  today: string,
): "end_date_required" | "offer_ended" | null {
  if (!offer.ends_on && !offer.open_ended) return "end_date_required";
  if (offer.ends_on && offer.ends_on < today) return "offer_ended";
  return null;
}
