import { inLocationScope, roleAtLeast, type Membership } from "@/lib/auth";
import { marketCurrency, type OfferCurrency } from "@/lib/workspace/offer-format";

// Client components render offers too, so the currency rule and its type live in
// a module with no server imports; they are re-exported so existing importers keep working.
export { marketCurrency };
export type { OfferCurrency };

/**
 * Offer domain rules (docs/superpowers/specs/2026-10-01-offers-promotion-copy-design.md
 * 1.1 and 3.3). An offer is an owner-confirmed fact record that promotion copy
 * is written from. Validation here mirrors the CHECK constraints in
 * neon/migrations/0011_offers.sql so a bad body is a 400, never a SQL error.
 *
 * "Expired" is never computed here: it comes only from SQL
 * `public.offer_is_expired`, so the workspace-local date is the single clock.
 */
export type OfferStatus = "draft" | "confirmed" | "archived";

export interface Offer {
  id: string;
  workspaceId: string;
  locationId: string | null;
  title: string;
  details: string;
  terms: string;
  priceAmount: number | null;
  currency: OfferCurrency | null;
  validFrom: string;
  validUntil: string;
  claims: string[];
  prohibitedTerms: string[];
  assetId: string | null;
  status: OfferStatus;
  revision: number;
  confirmedAt: string | null;
  expired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OfferInput {
  location_id: string | null;
  title: string;
  details: string;
  terms: string;
  price_amount: number | null;
  currency: OfferCurrency | null;
  valid_from: string;
  valid_until: string;
  claims: string[];
  prohibited_terms: string[];
  asset_id: string | null;
}

export type OfferParse = { ok: true; offer: OfferInput } | { ok: false; error: string };

export type OfferErrorCode =
  | "offer_not_found"
  | "offer_archived"
  | "offer_revision_changed"
  | "offer_incomplete"
  | "offer_currency_market"
  | "offer_expired";

export class OfferError extends Error {
  constructor(public readonly code: OfferErrorCode) {
    super(code);
    this.name = "OfferError";
  }
}

const MAX_TITLE = 120;
const MAX_DETAILS = 1000;
const MAX_TERMS = 1000;
const MAX_LIST_ITEMS = 20;
const MAX_ITEM_LENGTH = 200;
const MAX_PRICE = 9_999_999_999.99;

function text(value: unknown, field: string, min: number, max: number): { ok: true; value: string } | { ok: false; error: string } {
  if (value == null && min === 0) return { ok: true, value: "" };
  if (typeof value !== "string") return { ok: false, error: `${field} must be text` };
  const trimmed = value.trim();
  if (trimmed.length < min) return { ok: false, error: `${field} is required` };
  if (trimmed.length > max) return { ok: false, error: `${field} must be at most ${max} characters` };
  return { ok: true, value: trimmed };
}

function stringList(value: unknown, field: string): { ok: true; list: string[] } | { ok: false; error: string } {
  if (value == null) return { ok: true, list: [] };
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) return { ok: false, error: `${field} must be a list of at most ${MAX_LIST_ITEMS} entries` };
  const list: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return { ok: false, error: `${field} entries must be strings` };
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_ITEM_LENGTH) return { ok: false, error: `${field} entries must be at most ${MAX_ITEM_LENGTH} characters` };
    list.push(trimmed);
  }
  return { ok: true, list: [...new Set(list)] };
}

function isoDate(value: unknown, field: string): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: false, error: `${field} must be a YYYY-MM-DD date` };
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return { ok: false, error: `${field} must be a real date` };
  return { ok: true, value };
}

function optionalId(value: unknown, field: string): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: `${field} must be an id` };
  return { ok: true, value };
}

/** At most two decimals, read by value: 12.345 is rejected, 1280.5 and 1280 are not. */
function hasAtMostTwoDecimals(n: number): boolean {
  return Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
}

export function parseOfferBody(raw: unknown, market: "hk" | "tw"): OfferParse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "body must be an object" };
  const body = raw as Record<string, unknown>;

  const title = text(body.title, "title", 1, MAX_TITLE);
  if (!title.ok) return title;
  const details = text(body.details, "details", 1, MAX_DETAILS);
  if (!details.ok) return details;
  const terms = text(body.terms, "terms", 0, MAX_TERMS);
  if (!terms.ok) return terms;

  const validFrom = isoDate(body.valid_from, "valid_from");
  if (!validFrom.ok) return validFrom;
  const validUntil = isoDate(body.valid_until, "valid_until");
  if (!validUntil.ok) return validUntil;
  if (validUntil.value < validFrom.value) return { ok: false, error: "valid_until must not be before valid_from" };

  let priceAmount: number | null = null;
  if (body.price_amount != null) {
    const price = body.price_amount;
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > MAX_PRICE || !hasAtMostTwoDecimals(price)) {
      return { ok: false, error: "price_amount must be a number from 0 to 9999999999.99 with at most 2 decimals" };
    }
    priceAmount = price;
  }
  const expected = marketCurrency(market);
  let currency: OfferCurrency | null = null;
  if (priceAmount === null) {
    if (body.currency != null) return { ok: false, error: "currency requires a price_amount" };
  } else {
    if (body.currency == null) return { ok: false, error: "currency is required with a price_amount" };
    if (body.currency !== expected) return { ok: false, error: `currency must be ${expected}` };
    currency = expected;
  }

  const claims = stringList(body.claims, "claims");
  if (!claims.ok) return { ok: false, error: claims.error };
  const prohibited = stringList(body.prohibited_terms, "prohibited_terms");
  if (!prohibited.ok) return { ok: false, error: prohibited.error };
  const locationId = optionalId(body.location_id, "location_id");
  if (!locationId.ok) return locationId;
  const assetId = optionalId(body.asset_id, "asset_id");
  if (!assetId.ok) return assetId;

  return {
    ok: true,
    offer: {
      location_id: locationId.value,
      title: title.value,
      details: details.value,
      terms: terms.value,
      price_amount: priceAmount,
      currency,
      valid_from: validFrom.value,
      valid_until: validUntil.value,
      claims: claims.list,
      prohibited_terms: prohibited.list,
      asset_id: assetId.value,
    },
  };
}

/** Everyone in the workspace reads the workspace-wide offers; a scoped manager reads only in-scope location offers. */
export function canReadOffer(m: Membership, locationId: string | null): boolean {
  return inLocationScope(m, locationId);
}

/** Creating drafts from an offer follows the existing action rules: manager or above, in scope. */
export function canUseOffer(m: Membership, locationId: string | null): boolean {
  return roleAtLeast(m.role, "manager") && inLocationScope(m, locationId);
}

/** Create, edit, confirm or archive. A workspace-wide offer (null location) is owner-only. */
export function canManageOffer(m: Membership, locationId: string | null): boolean {
  if (m.role === "owner") return true;
  if (m.role === "manager") return locationId !== null && inLocationScope(m, locationId);
  return false;
}
