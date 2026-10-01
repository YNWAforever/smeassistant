import type { OfferRow } from "./types";

/** A confirmed, priced, dated HK offer; override any field per test. */
export function offerRow(overrides: Partial<OfferRow> = {}): OfferRow {
  return {
    id: "00000000-0000-4000-8000-0000000000a1",
    workspace_id: "W1",
    location_id: null,
    title: "Weekday lunch set",
    details: "Soup, main and drink",
    terms: "Monday to Friday, 12:00–15:00",
    price_amount: "88.00",
    currency: "HKD",
    starts_on: "2026-10-05",
    ends_on: "2026-10-31",
    open_ended: false,
    approved_claims: [],
    prohibited_wording: [],
    asset_ids: [],
    source: "owner_form",
    status: "confirmed",
    revision: 1,
    confirmed_by: "U1",
    confirmed_at: "2026-10-01T02:00:00.000Z",
    created_by: "U1",
    created_at: "2026-10-01T01:00:00.000Z",
    updated_at: "2026-10-01T02:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}
