import { describe, expect, it } from "vitest";

import { formatOfferDate, formatOfferPrice, isOfferStaleCode, marketCurrency, offerStaleKind } from "@/lib/workspace/offer-format";

describe("marketCurrency", () => {
  it("is fixed by market, never by interface language", () => {
    expect(marketCurrency("hk")).toBe("HKD");
    expect(marketCurrency("tw")).toBe("TWD");
  });
});

describe("formatOfferPrice", () => {
  it("reads the amount by value and keeps cents only when there are some", () => {
    expect(formatOfferPrice(1280, "HKD", "en")).toBe("HK$1,280");
    expect(formatOfferPrice(1280.5, "HKD", "zh-HK")).toBe("HK$1,280.50");
    expect(formatOfferPrice(0, "HKD", "en")).toBe("HK$0");
  });

  it("is null without a price or a currency", () => {
    expect(formatOfferPrice(null, null, "en")).toBeNull();
    expect(formatOfferPrice(100, null, "en")).toBeNull();
  });

  it("marks TWD distinctly from HKD", () => {
    expect(formatOfferPrice(2800, "TWD", "en")).toBe("NT$2,800");
  });
});

describe("formatOfferDate", () => {
  it("never shifts a calendar date across a time zone", () => {
    expect(formatOfferDate("2026-10-01", "en")).toBe("1 Oct 2026");
    expect(formatOfferDate("2026-12-31", "en")).toBe("31 Dec 2026");
  });

  it("returns an unparseable value unchanged", () => {
    expect(formatOfferDate("soon", "en")).toBe("soon");
  });
});

describe("offerStaleKind", () => {
  const confirmed = { status: "confirmed" as const, expired: false, revision: 2 };

  it("is null when the latest draft recorded the current revision", () => {
    expect(offerStaleKind(confirmed, { hasVersion: true, recordedRevision: 2 })).toBeNull();
  });

  it("is offer_changed when the draft recorded another revision, or none", () => {
    expect(offerStaleKind(confirmed, { hasVersion: true, recordedRevision: 1 })).toBe("offer_changed");
    expect(offerStaleKind(confirmed, { hasVersion: true, recordedRevision: null })).toBe("offer_changed");
  });

  it("has nothing to be stale before a draft exists", () => {
    expect(offerStaleKind(confirmed, { hasVersion: false, recordedRevision: null })).toBeNull();
  });

  it("names an ended or archived offer before a revision mismatch", () => {
    expect(offerStaleKind({ ...confirmed, expired: true }, { hasVersion: true, recordedRevision: 1 })).toBe("offer_expired");
    expect(offerStaleKind({ ...confirmed, status: "archived" }, { hasVersion: true, recordedRevision: 1 })).toBe("offer_inactive");
    expect(offerStaleKind({ ...confirmed, status: "archived", expired: true }, { hasVersion: true, recordedRevision: 2 })).toBe("offer_inactive");
  });

  it("calls an unconfirmed offer inactive once its drafts match, and changed while they do not", () => {
    expect(offerStaleKind({ ...confirmed, status: "draft" }, { hasVersion: true, recordedRevision: 2 })).toBe("offer_inactive");
    expect(offerStaleKind({ ...confirmed, status: "draft" }, { hasVersion: false, recordedRevision: null })).toBe("offer_inactive");
    expect(offerStaleKind({ ...confirmed, status: "draft", revision: 3 }, { hasVersion: true, recordedRevision: 2 })).toBe("offer_changed");
  });
});

describe("isOfferStaleCode", () => {
  it("accepts exactly the three codes approve and export answer", () => {
    for (const code of ["offer_changed", "offer_expired", "offer_inactive"]) expect(isOfferStaleCode(code)).toBe(true);
    for (const code of ["offer_archived", "version_closed", "", null, 409]) expect(isOfferStaleCode(code)).toBe(false);
  });
});
