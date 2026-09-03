import { describe, expect, it } from "vitest";
import { shouldRetryAiMode } from "./retry-decision";
import type { MerchantPerformanceEvidenceRun } from "@sme-scanner/scoring";

function run(over: Partial<MerchantPerformanceEvidenceRun>): MerchantPerformanceEvidenceRun {
  const base: MerchantPerformanceEvidenceRun = {
    id: "r1",
    query: "q",
    query_type: "need",
    engine: "google_ai_mode",
    requested_at: "2026-07-02T00:00:00Z",
    settings: { gl: "hk", hl: "zh-TW", location: "Hong Kong", device: "desktop" },
    serpapi: { status: "Success", search_id: null, total_time_taken: null, error: null },
    merchant_presence: {
      found: false,
      confidence: "none",
      confidence_reason: "",
      matched_by: [],
      ai_mentioned: false,
      ai_cited: false,
      ai_citation_urls: [],
      organic_rank: null,
      local_pack_rank: null,
      maps_rank: null,
    },
    competitors: [],
    evidence_snippets: [],
    raw_refs: {},
  };
  return { ...base, ...over };
}

describe("shouldRetryAiMode", () => {
  it("retries when the AI-mode run has no match at all", () => {
    expect(shouldRetryAiMode([run({})])).toBe(true);
  });

  it("retries when the AI-mode run is a low-confidence fuzzy match", () => {
    const base = run({});
    expect(
      shouldRetryAiMode([{ ...base, merchant_presence: { ...base.merchant_presence, confidence: "low", found: true } }]),
    ).toBe(true);
  });

  it("does not retry when the AI-mode run already has a confident citation", () => {
    const base = run({});
    expect(
      shouldRetryAiMode([
        { ...base, merchant_presence: { ...base.merchant_presence, confidence: "high", found: true, ai_cited: true } },
      ]),
    ).toBe(false);
  });

  it("does not retry when a different run already confirms a citation", () => {
    const ambiguous = run({});
    const confirmed = run({
      id: "r2",
      engine: "google",
    });
    expect(
      shouldRetryAiMode([
        ambiguous,
        { ...confirmed, merchant_presence: { ...confirmed.merchant_presence, confidence: "high", found: true, ai_cited: true } },
      ]),
    ).toBe(false);
  });

  it("does not retry when the AI-mode run itself failed (unavailable)", () => {
    expect(
      shouldRetryAiMode([run({ serpapi: { status: "Error", search_id: null, total_time_taken: null, error: "timeout" } })]),
    ).toBe(false);
  });

  it("does not retry when there's no AI-mode run at all", () => {
    expect(shouldRetryAiMode([run({ engine: "google" })])).toBe(false);
  });
});
