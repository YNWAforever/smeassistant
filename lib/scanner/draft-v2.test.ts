import { describe, expect, it } from "vitest";
import { canSubmitScannerDraft, emptyScannerDraft, parseScannerDraft, type ScannerDraftV1 } from "./draft";

const legacy: ScannerDraftV1 = {
  version: 1,
  market: "TW",
  businessName: "Legacy Cafe",
  placeId: "place-1",
  placeMatchConfidence: "high",
  continueWithoutPlace: false,
  websiteUrl: "https://legacy.test",
  instagramHandle: "legacy",
  industry: "restaurant",
  district: "Taipei",
  objective: "more_leads",
};

describe("scanner draft v2", () => {
  it("migrates v1 fields without claiming legacy IDs came from SerpApi", () => {
    expect(parseScannerDraft(JSON.stringify(legacy))).toEqual(expect.objectContaining({
      version: 2,
      market: "TW",
      businessName: "Legacy Cafe",
      placeId: null,
      placeMatchConfidence: null,
      websiteUrl: "https://legacy.test",
      instagramHandle: "legacy",
      industry: "restaurant",
      district: "Taipei",
      objective: "more_leads",
      provider: null,
      manualEntry: false,
      dataId: null,
      dataCid: null,
      alternateNames: [],
      address: "",
      mapsUrl: "",
      facebookUrl: "",
    }));
  });

  it("creates an empty v2 draft", () => {
    expect(emptyScannerDraft("HK")).toEqual(expect.objectContaining({ version: 2, market: "HK", provider: null, manualEntry: false }));
  });

  it("accepts a provider identity without place_id", () => {
    const draft = { ...emptyScannerDraft("HK"), businessName: "Cafe", dataId: "0x1:0x2", provider: "serpapi" as const, placeMatchConfidence: "medium" as const, industry: "restaurant", district: "Central" };
    expect(canSubmitScannerDraft(draft)).toBe(true);
  });

  it("accepts explicit manual entry and rejects identity-free non-manual drafts", () => {
    const base = { ...emptyScannerDraft("HK"), businessName: "Cafe", industry: "restaurant", district: "Central" };
    expect(canSubmitScannerDraft({ ...base, manualEntry: true })).toBe(true);
    expect(canSubmitScannerDraft(base)).toBe(false);
  });
});

describe("instagram match provenance", () => {
  it("defaults to null on a new draft", () => {
    expect(emptyScannerDraft("HK").instagramMatchProvenance).toBeNull();
  });

  it("round-trips a valid provenance", () => {
    const draft = {
      ...emptyScannerDraft("HK"),
      instagramHandle: "kamman.hk",
      instagramMatchProvenance: "gbp_cross_referenced" as const,
    };
    expect(parseScannerDraft(JSON.stringify(draft))?.instagramMatchProvenance).toBe("gbp_cross_referenced");
  });

  it("normalizes a v2 draft written before this field existed to null", () => {
    const legacy = { ...emptyScannerDraft("HK") } as Record<string, unknown>;
    delete legacy.instagramMatchProvenance;
    const parsed = parseScannerDraft(JSON.stringify(legacy));
    expect(parsed).not.toBeNull();
    expect(parsed?.instagramMatchProvenance).toBeNull();
  });

  it("rejects an unrecognized provenance value", () => {
    const draft = { ...emptyScannerDraft("HK"), instagramMatchProvenance: "oauth_verified" };
    expect(parseScannerDraft(JSON.stringify(draft))).toBeNull();
  });
});
