import { describe, expect, it } from "vitest";
import { confirmable, parseOfferBody } from "./validate";

const base = { title: "Lunch set", details: "Soup and main", starts_on: "2026-10-05", ends_on: "2026-10-31" };
const parse = (patch: Record<string, unknown>, market: "hk" | "tw" = "hk") => parseOfferBody({ ...base, ...patch }, { market });
const error = (patch: Record<string, unknown>, market: "hk" | "tw" = "hk") => {
  const result = parse(patch, market);
  return result.ok ? null : result.error;
};

describe("parseOfferBody", () => {
  it("accepts a valid offer and trims it", () => {
    const result = parse({ title: "  Lunch set ", terms: "  ", price_amount: 88 });
    expect(result).toEqual({ ok: true, offer: expect.objectContaining({ title: "Lunch set", terms: null, price_amount: "88.00", currency: "HKD", open_ended: false }) });
  });
  it("refuses blank or long text", () => {
    expect(error({ title: " " })).toBe("title_invalid");
    expect(error({ title: "x".repeat(121) })).toBe("title_invalid");
    expect(error({ details: undefined })).toBe("details_invalid");
    expect(error({ terms: "x".repeat(1001) })).toBe("terms_invalid");
  });
  it("refuses a bad price", () => {
    expect(error({ price_amount: 12.345 })).toBe("price_invalid");
    expect(error({ price_amount: -1 })).toBe("price_invalid");
    expect(error({ price_amount: "abc" })).toBe("price_invalid");
  });
  it("sets the currency from the market and refuses another market's", () => {
    expect(error({ price_amount: 88, currency: "TWD" })).toBe("currency_market_mismatch");
    const tw = parse({ price_amount: 88 }, "tw");
    expect(tw.ok && tw.offer.currency).toBe("TWD");
    const unpriced = parse({});
    expect(unpriced.ok && unpriced.offer.currency).toBeNull();
  });
  it("refuses bad dates", () => {
    expect(error({ ends_on: "2026-10-01" })).toBe("dates_invalid");
    expect(error({ open_ended: true })).toBe("dates_invalid");
    expect(error({ starts_on: "2026-02-30" })).toBe("dates_invalid");
    expect(error({ starts_on: undefined })).toBe("dates_invalid");
    const open = parse({ ends_on: null, open_ended: true });
    expect(open.ok && open.offer.open_ended).toBe(true);
  });
  it("bounds claims, wording and assets", () => {
    expect(error({ asset_ids: Array.from({ length: 5 }, (_, i) => `00000000-0000-4000-8000-00000000000${i}`) })).toBe("assets_invalid");
    expect(error({ asset_ids: ["not-a-uuid"] })).toBe("assets_invalid");
    expect(error({ approved_claims: Array.from({ length: 11 }, (_, i) => `claim ${i}`) })).toBe("claims_invalid");
    expect(error({ approved_claims: ["x".repeat(201)] })).toBe("claims_invalid");
    expect(error({ prohibited_wording: "cheap" })).toBe("wording_invalid");
    const result = parse({ approved_claims: ["  ", "Home-made", "Home-made"] });
    expect(result.ok && result.offer.approved_claims).toEqual(["Home-made"]);
  });
  it("accepts a location id and refuses a malformed one", () => {
    expect(error({ location_id: "L1" })).toBe("location_invalid");
    const result = parse({ location_id: "00000000-0000-4000-8000-000000000001" });
    expect(result.ok && result.offer.location_id).toBe("00000000-0000-4000-8000-000000000001");
  });
});

describe("confirmable", () => {
  it("needs an end-date choice", () => {
    expect(confirmable({ starts_on: "2026-10-05", ends_on: null, open_ended: false }, "2026-10-01")).toBe("end_date_required");
    expect(confirmable({ starts_on: "2026-10-05", ends_on: null, open_ended: true }, "2026-10-01")).toBeNull();
  });
  it("refuses an offer that has ended", () => {
    expect(confirmable({ starts_on: "2026-10-05", ends_on: "2026-10-31", open_ended: false }, "2026-11-01")).toBe("offer_ended");
    expect(confirmable({ starts_on: "2026-10-05", ends_on: "2026-10-31", open_ended: false }, "2026-10-31")).toBeNull();
  });
});
