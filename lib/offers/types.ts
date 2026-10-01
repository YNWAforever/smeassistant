/**
 * Owner-confirmed offers (P4.1, docs/superpowers/specs/2026-10-01-offer-promotion-copy-design.md §2).
 * An offer row is the owner's own facts; drafts written from it live in
 * output_versions and record the revision they used ({@link OfferBinding}).
 */
export type OfferStatus = "draft" | "confirmed" | "archived";
export type OfferCurrency = "HKD" | "TWD";

export interface OfferRow {
  id: string;
  workspace_id: string;
  location_id: string | null;
  title: string;
  details: string;
  terms: string | null;
  /** numeric(12,2) as PostgreSQL returns it, e.g. "88.00". */
  price_amount: string | null;
  currency: OfferCurrency | null;
  /** YYYY-MM-DD, a calendar date in the workspace timezone. */
  starts_on: string;
  ends_on: string | null;
  open_ended: boolean;
  approved_claims: string[];
  prohibited_wording: string[];
  asset_ids: string[];
  source: "owner_form";
  status: OfferStatus;
  revision: number;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/** The owner-editable facts, as validated by parseOfferBody. */
export interface OfferInput {
  location_id: string | null;
  title: string;
  details: string;
  terms: string | null;
  price_amount: string | null;
  currency: OfferCurrency | null;
  starts_on: string;
  ends_on: string | null;
  open_ended: boolean;
  approved_claims: string[];
  prohibited_wording: string[];
  asset_ids: string[];
}

export type OfferInputError =
  | "title_invalid"
  | "details_invalid"
  | "terms_invalid"
  | "price_invalid"
  | "currency_market_mismatch"
  | "dates_invalid"
  | "claims_invalid"
  | "wording_invalid"
  | "assets_invalid"
  | "location_invalid";

/** What a version records about the offer it was written from. */
export interface OfferBinding {
  id: string;
  revision: number;
}

export type OfferUsability = "usable" | "missing" | "unconfirmed" | "ended" | "archived" | "wrong_location" | "wrong_currency";
export type BindingStatus = "current" | "changed" | "ended" | "unconfirmed" | "archived" | "unbound";

export type OfferChannel = "google_post" | "instagram_post" | "whatsapp_message" | "line_message";
