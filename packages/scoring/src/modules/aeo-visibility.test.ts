import { describe, expect, it } from "vitest";
import { scoreAEO } from "./aeo";
import type { AEOPayload, AEOPerformanceRun } from "../types";

const basePayload = (runs: NonNullable<AEOPayload["performance_runs"]>): AEOPayload => ({
  available: true,
  serpapi_runs: [],
  performance_runs: runs,
  website: { available: true, has_faq_schema: false, meta_description_len: 120, h1_count: 1 },
});

// Helper to build a performance run with sensible defaults so each test only states
// the fields it cares about. Mirrors the exact AEOPerformanceRun shape.
const run = (overrides: Partial<AEOPerformanceRun>): AEOPerformanceRun => ({
  query: "best cafe in Causeway Bay Hong Kong",
  query_type: "discovery",
  engine: "google",
  available: true,
  unsupported: false,
  ai_overview_triggered: null,
  ai_mentioned: false,
  ai_cited: false,
  organic_rank: null,
  local_pack_rank: null,
  maps_rank: null,
  confidence: "none",
  matched_by: [],
  competitors_above: [],
  ...overrides,
});

describe("scoreAEO visibility evidence", () => {
  it("absence of evidence is not a perfect score", () => {
    // r/v0vQfNdF scenario: every surface failed to produce usable evidence.
    const result = scoreAEO(basePayload([
      run({ query_type: "discovery", engine: "google", available: false }),
      run({ query_type: "maps", engine: "google_maps", available: false }),
      run({ query_type: "discovery", engine: "google_ai_mode", available: true, ai_answered: false }),
    ]));

    expect(result).toMatchObject({
      status: "unavailable",
      score: null,
      confidence: "none",
      limitationCode: "AEO_NOT_MEASURED",
    });
    expect(result.findings).toEqual([]);
  });

  it("maps available but merchant not found is penalized", () => {
    const result = scoreAEO(basePayload([
      run({ query_type: "maps", engine: "google_maps", available: true, unsupported: false, maps_rank: null }),
    ]));

    const finding = result.findings.find((f) => f.finding_key === "aeo.maps_visibility_poor");
    expect(finding).toBeDefined();
    expect(finding?.score_impact).toBe(-15);
  });

  it("invisible across all measured surfaces scores low", () => {
    const result = scoreAEO(basePayload([
      run({ query_type: "discovery", engine: "google", available: true, organic_rank: null }),
      run({ query_type: "maps", engine: "google_maps", available: true, maps_rank: null }),
      run({
        query_type: "discovery",
        engine: "google_ai_mode",
        available: true,
        ai_answered: true,
        ai_cited: false,
        confidence: "none",
      }),
    ]));

    expect(result.score).toBe(50);
    const keys = result.findings.map((f) => f.finding_key);
    expect(keys).toContain("aeo.search_visibility_poor");
    expect(keys).toContain("aeo.maps_visibility_poor");
    expect(keys).toContain("aeo.ai_citation_missing");
  });

  it("a genuinely visible merchant keeps a high score", () => {
    const result = scoreAEO(basePayload([
      run({ query_type: "discovery", engine: "google", available: true, organic_rank: 2 }),
      run({ query_type: "maps", engine: "google_maps", available: true, maps_rank: 1 }),
    ]));

    expect(result.score).toBe(100);
    const keys = result.findings.map((f) => f.finding_key);
    expect(keys).not.toContain("aeo.data_unavailable");
    expect(keys).not.toContain("aeo.search_visibility_poor");
    expect(keys).not.toContain("aeo.maps_visibility_poor");
  });
});
