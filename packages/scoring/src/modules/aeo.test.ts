import { describe, expect, it } from "vitest";
import { scoreAEO } from "./aeo";
import type { AEOPayload, AEOPerformanceRun } from "../types";

function baseRun(over: Partial<AEOPerformanceRun>): AEOPerformanceRun {
  return {
    query: "q",
    query_type: "need",
    engine: "google_ai_mode",
    available: true,
    unsupported: false,
    ai_overview_triggered: null,
    ai_answered: true,
    ai_mentioned: false,
    ai_cited: false,
    organic_rank: null,
    local_pack_rank: null,
    maps_rank: null,
    confidence: "none",
    matched_by: [],
    competitors_above: [],
    ...over,
  };
}

describe("scoreAEO owner_action coverage", () => {
  it("emits non-empty owner_action_zh for every performance-path finding", () => {
    const payload: AEOPayload = {
      available: true,
      serpapi_runs: [],
      performance_runs: [
        baseRun({ query_type: "discovery", engine: "google", ai_overview_triggered: false, competitors_above: ["Rival A", "Rival A"] }),
        baseRun({ query_type: "maps", engine: "google_maps", maps_rank: 9, confidence: "high", matched_by: ["place_id"], competitors_above: ["Rival A"] }),
      ],
      website: { available: true, has_faq_schema: false, meta_description_len: 10, h1_count: 1 },
    };
    const result = scoreAEO(payload);
    expect(result.findings.length).toBeGreaterThan(0);
    const missing = result.findings.filter(
      (f) => !f.owner_action_zh || f.owner_action_zh.trim().length === 0,
    );
    expect(missing.map((f) => f.finding_key)).toEqual([]);
  });

  it("hedges the ai_citation_missing message when the only signal is a low-confidence fuzzy match", () => {
    const result = scoreAEO({
      available: true,
      serpapi_runs: [],
      performance_runs: [baseRun({ ai_cited: true, confidence: "low", matched_by: ["fuzzy_name"] })],
    });
    const finding = result.findings.find((f) => f.finding_key === "aeo.ai_citation_missing");
    expect(finding?.owner_message_en).toContain("couldn't confidently confirm");
  });

  it("asserts a confident absence when there is no signal at all", () => {
    const result = scoreAEO({
      available: true,
      serpapi_runs: [],
      performance_runs: [baseRun({ ai_cited: false, confidence: "none" })],
    });
    const finding = result.findings.find((f) => f.finding_key === "aeo.ai_citation_missing");
    expect(finding?.owner_message_en).toContain("don't cite your official website");
  });

  it("does not emit ai_citation_missing when a retried brand run confirms a citation", () => {
    // Mirrors the bounded-retry flow: the original need-query run is ambiguous, the appended
    // brand-phrased retry run confirms a citation confidently — the deduction must clear.
    const result = scoreAEO({
      available: true,
      serpapi_runs: [],
      performance_runs: [
        baseRun({ confidence: "low", matched_by: ["fuzzy_name"] }),
        baseRun({ query_type: "brand", ai_cited: true, confidence: "high", matched_by: ["brand_alias"] }),
      ],
    });
    expect(result.findings.some((f) => f.finding_key === "aeo.ai_citation_missing")).toBe(false);
  });
});
