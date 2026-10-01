import { describe, expect, it } from "vitest";

import type { Membership } from "@/lib/auth";
import { offerPromotionsEnabled } from "./offers-flag";
import { canManageOffer, canReadOffer, canUseOffer, marketCurrency, parseOfferBody } from "./offers";

const MINIMAL = { title: "Lunch set", details: "Soup and a main", valid_from: "2026-10-01", valid_until: "2026-10-31" };

function ok(raw: unknown, market: "hk" | "tw" = "hk") {
  const parsed = parseOfferBody(raw, market);
  if (!parsed.ok) throw new Error(`expected ok, got ${parsed.error}`);
  return parsed.offer;
}
function err(raw: unknown, market: "hk" | "tw" = "hk") {
  const parsed = parseOfferBody(raw, market);
  if (parsed.ok) throw new Error("expected an error");
  return parsed.error;
}

describe("parseOfferBody", () => {
  it("accepts a minimal valid body and fills the optional fields", () => {
    expect(ok(MINIMAL)).toEqual({
      location_id: null,
      title: "Lunch set",
      details: "Soup and a main",
      terms: "",
      price_amount: null,
      currency: null,
      valid_from: "2026-10-01",
      valid_until: "2026-10-31",
      claims: [],
      prohibited_terms: [],
      asset_id: null,
    });
  });

  it("trims text fields and keeps a location and asset id", () => {
    const offer = ok({ ...MINIMAL, title: "  Lunch set  ", details: " d ", terms: " t ", location_id: "L1", asset_id: "A1" });
    expect(offer).toMatchObject({ title: "Lunch set", details: "d", terms: "t", location_id: "L1", asset_id: "A1" });
  });

  it("rejects a non-object body and blank required text", () => {
    expect(err(null)).toBeTruthy();
    expect(err("x")).toBeTruthy();
    expect(err({ ...MINIMAL, title: "   " })).toMatch(/title/);
    expect(err({ ...MINIMAL, details: "" })).toMatch(/details/);
    expect(err({ ...MINIMAL, details: undefined })).toMatch(/details/);
  });

  it("enforces the title, details and terms length limits", () => {
    expect(ok({ ...MINIMAL, title: "x".repeat(120) }).title).toHaveLength(120);
    expect(err({ ...MINIMAL, title: "x".repeat(121) })).toMatch(/title/);
    expect(err({ ...MINIMAL, details: "x".repeat(1001) })).toMatch(/details/);
    expect(ok({ ...MINIMAL, terms: "x".repeat(1000) }).terms).toHaveLength(1000);
    expect(err({ ...MINIMAL, terms: "x".repeat(1001) })).toMatch(/terms/);
  });

  it("requires real calendar dates in order", () => {
    expect(err({ ...MINIMAL, valid_until: "2026-09-30" })).toMatch(/valid_until/);
    expect(err({ ...MINIMAL, valid_from: "2026-13-01" })).toMatch(/valid_from/);
    expect(err({ ...MINIMAL, valid_until: "2026-02-30" })).toMatch(/valid_until/);
    expect(err({ ...MINIMAL, valid_from: "2026-1-1" })).toMatch(/valid_from/);
    expect(err({ ...MINIMAL, valid_from: undefined })).toMatch(/valid_from/);
    expect(ok({ ...MINIMAL, valid_from: "2026-10-01", valid_until: "2026-10-01" }).valid_until).toBe("2026-10-01");
  });

  it("accepts prices by value with at most two decimals up to 9,999,999,999.99", () => {
    expect(ok({ ...MINIMAL, price_amount: 0, currency: "HKD" }).price_amount).toBe(0);
    expect(ok({ ...MINIMAL, price_amount: 1280.5, currency: "HKD" }).price_amount).toBe(1280.5);
    expect(ok({ ...MINIMAL, price_amount: 9999999999.99, currency: "HKD" }).price_amount).toBe(9999999999.99);
    expect(err({ ...MINIMAL, price_amount: -1, currency: "HKD" })).toMatch(/price_amount/);
    expect(err({ ...MINIMAL, price_amount: 12.345, currency: "HKD" })).toMatch(/price_amount/);
    expect(err({ ...MINIMAL, price_amount: 1e12, currency: "HKD" })).toMatch(/price_amount/);
    expect(err({ ...MINIMAL, price_amount: "12", currency: "HKD" })).toMatch(/price_amount/);
    expect(err({ ...MINIMAL, price_amount: Number.NaN, currency: "HKD" })).toMatch(/price_amount/);
  });

  it("requires a currency exactly when there is a price, and ties it to the market", () => {
    expect(err({ ...MINIMAL, price_amount: 10 })).toMatch(/currency/);
    expect(err({ ...MINIMAL, currency: "HKD" })).toMatch(/currency/);
    expect(err({ ...MINIMAL, price_amount: 10, currency: "TWD" }, "hk")).toBe("currency must be HKD");
    expect(err({ ...MINIMAL, price_amount: 10, currency: "HKD" }, "tw")).toBe("currency must be TWD");
    expect(err({ ...MINIMAL, price_amount: 10, currency: "USD" }, "hk")).toBe("currency must be HKD");
    expect(ok({ ...MINIMAL, price_amount: 10, currency: "TWD" }, "tw").currency).toBe("TWD");
  });

  it("accepts a null price with a null currency", () => {
    const offer = ok({ ...MINIMAL, price_amount: null, currency: null });
    expect(offer.price_amount).toBeNull();
    expect(offer.currency).toBeNull();
  });

  it("limits claims and prohibited terms to 20 entries of 200 characters, trimmed and deduplicated", () => {
    expect(err({ ...MINIMAL, claims: Array.from({ length: 21 }, (_, i) => `c${i}`) })).toMatch(/claims/);
    expect(err({ ...MINIMAL, claims: ["x".repeat(201)] })).toMatch(/claims/);
    expect(err({ ...MINIMAL, prohibited_terms: Array.from({ length: 21 }, (_, i) => `p${i}`) })).toMatch(/prohibited_terms/);
    expect(err({ ...MINIMAL, claims: [1] })).toMatch(/claims/);
    expect(err({ ...MINIMAL, claims: "x" })).toMatch(/claims/);
    expect(ok({ ...MINIMAL, claims: Array.from({ length: 20 }, (_, i) => `c${i}`) }).claims).toHaveLength(20);
    expect(ok({ ...MINIMAL, claims: [" Halal ", "Halal", "", "Fresh"] }).claims).toEqual(["Halal", "Fresh"]);
    expect(ok({ ...MINIMAL, prohibited_terms: ["best", " best "] }).prohibited_terms).toEqual(["best"]);
  });
});

describe("marketCurrency", () => {
  it("maps hk to HKD and tw to TWD", () => {
    expect(marketCurrency("hk")).toBe("HKD");
    expect(marketCurrency("tw")).toBe("TWD");
  });
});

function member(role: Membership["role"], locationScope: string[] | null): Membership {
  return { workspaceId: "w", workspaceSlug: "w", userId: "u", email: "u@example.test", role, locationScope };
}

describe("offer permissions (spec 3.3)", () => {
  const owner = member("owner", null);
  const scopedManager = member("manager", ["L1"]);
  const openManager = member("manager", null);
  const viewer = member("viewer", null);

  it("an owner may read, use and manage everything", () => {
    for (const loc of ["L1", "L2", null]) {
      expect([canReadOffer(owner, loc), canUseOffer(owner, loc), canManageOffer(owner, loc)]).toEqual([true, true, true]);
    }
  });

  it("a scoped manager manages and uses L1, cannot use or manage L2, and uses but cannot manage workspace-wide", () => {
    expect([canReadOffer(scopedManager, "L1"), canUseOffer(scopedManager, "L1"), canManageOffer(scopedManager, "L1")]).toEqual([true, true, true]);
    expect([canUseOffer(scopedManager, "L2"), canManageOffer(scopedManager, "L2")]).toEqual([false, false]);
    expect([canReadOffer(scopedManager, null), canUseOffer(scopedManager, null), canManageOffer(scopedManager, null)]).toEqual([true, true, false]);
  });

  it("an unscoped manager manages any location offer but not a workspace-wide one", () => {
    expect([canReadOffer(openManager, "L1"), canUseOffer(openManager, "L1"), canManageOffer(openManager, "L1")]).toEqual([true, true, true]);
    expect([canReadOffer(openManager, null), canUseOffer(openManager, null), canManageOffer(openManager, null)]).toEqual([true, true, false]);
  });

  it("a viewer reads everything and uses or manages nothing", () => {
    for (const loc of ["L1", null]) {
      expect([canReadOffer(viewer, loc), canUseOffer(viewer, loc), canManageOffer(viewer, loc)]).toEqual([true, false, false]);
    }
  });
});

describe("offerPromotionsEnabled", () => {
  it("is true only for the exact string true", () => {
    expect(offerPromotionsEnabled({ OFFER_PROMOTIONS_ENABLED: "true" })).toBe(true);
    for (const value of ["TRUE", "1", "yes", " true", "", undefined]) {
      expect(offerPromotionsEnabled({ OFFER_PROMOTIONS_ENABLED: value })).toBe(false);
    }
    expect(offerPromotionsEnabled({})).toBe(false);
  });
});
