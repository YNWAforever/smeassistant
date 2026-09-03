import { describe, expect, it } from "vitest";
import {
  SCANNER_DRAFT_KEY,
  canSubmitScannerDraft,
  emptyScannerDraft,
  parseScannerDraft,
  readScannerDraft,
  writeScannerDraft,
  type ScannerDraftV1,
} from "./draft";
import { defaultMerchantSearchMarket } from "./merchant-search/market";

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

const draft: ScannerDraftV1 = {
  version: 1,
  market: "HK",
  businessName: "Happy Cafe",
  placeId: "place-123",
  placeMatchConfidence: "high",
  continueWithoutPlace: false,
  websiteUrl: "",
  instagramHandle: "",
  industry: "restaurant",
  district: "Central",
  objective: "more_leads",
};

const confirmedDraft = {
  ...emptyScannerDraft("HK"),
  businessName: "Happy Cafe",
  placeId: "place-123",
  placeMatchConfidence: "high" as const,
  provider: "serpapi" as const,
  industry: "restaurant",
  district: "Central",
};

describe("scanner draft v1", () => {
  it("starts a clean zh-TW interface session in Hong Kong", () => {
    expect(emptyScannerDraft(defaultMerchantSearchMarket("zh-TW")).market).toBe("HK");
  });

  it("round-trips every public field while keeping optional channels empty", () => {
    const target = storage();
    writeScannerDraft(draft, target);

    expect(target.getItem(SCANNER_DRAFT_KEY)).not.toBeNull();
    expect(readScannerDraft(target)).toEqual(expect.objectContaining({
      version: 2,
      market: draft.market,
      businessName: draft.businessName,
      websiteUrl: draft.websiteUrl,
      instagramHandle: draft.instagramHandle,
      industry: draft.industry,
      district: draft.district,
      objective: draft.objective,
      placeId: null,
      placeMatchConfidence: null,
      provider: null,
    }));
  });

  it("discards malformed and unknown versions", () => {
    expect(parseScannerDraft("{")).toBeNull();
    expect(parseScannerDraft(JSON.stringify({ ...draft, version: 2 }))).toBeNull();
    expect(parseScannerDraft(JSON.stringify({ ...draft, market: "US" }))).toBeNull();
    expect(parseScannerDraft(JSON.stringify({ ...draft, placeMatchConfidence: "certain" }))).toBeNull();
    expect(parseScannerDraft(JSON.stringify({ ...draft, objective: "other" }))).toBeNull();
  });

  it("requires a confirmed candidate or an explicit continue-without-match choice", () => {
    expect(canSubmitScannerDraft(confirmedDraft)).toBe(true);
    expect(canSubmitScannerDraft({
      ...draft,
      placeId: null,
      placeMatchConfidence: null,
      continueWithoutPlace: true,
    })).toBe(true);
    expect(canSubmitScannerDraft({
      ...draft,
      placeId: null,
      placeMatchConfidence: null,
      continueWithoutPlace: false,
    })).toBe(false);
  });

  it("requires confidence to accompany a selected place", () => {
    expect(canSubmitScannerDraft({
      ...draft,
      placeMatchConfidence: null,
    })).toBe(false);
  });

  it("requires the progressive form fields but not Instagram or website", () => {
    expect(canSubmitScannerDraft(confirmedDraft)).toBe(true);
    expect(canSubmitScannerDraft({ ...confirmedDraft, businessName: "" })).toBe(false);
    expect(canSubmitScannerDraft({ ...confirmedDraft, industry: "" })).toBe(false);
    expect(canSubmitScannerDraft({ ...confirmedDraft, district: "" })).toBe(false);
  });
});
