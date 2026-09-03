import { describe, expect, it } from "vitest";
import { scoreAEO } from "./aeo";
import type { AEOPayload } from "../types";

const basePayload = (runs: NonNullable<AEOPayload["performance_runs"]>): AEOPayload => ({
  available: true,
  serpapi_runs: [],
  performance_runs: runs,
  website: { available: true, has_faq_schema: false, meta_description_len: 120, h1_count: 1 },
});

describe("scoreAEO merchant performance runs", () => {
  it("penalizes missing AI citations without treating AI Overview absence as failure", () => {
    const result = scoreAEO(basePayload([
      {
        query: "銅鑼灣 cafe 推薦",
        query_type: "discovery",
        engine: "google",
        available: true,
        unsupported: false,
        ai_overview_triggered: false,
        ai_mentioned: false,
        ai_cited: false,
        organic_rank: 4,
        local_pack_rank: null,
        maps_rank: null,
        confidence: "none",
        matched_by: [],
        competitors_above: ["Competitor Cafe"],
      },
      {
        query: "best cafe in Causeway Bay Hong Kong",
        query_type: "discovery",
        engine: "google_ai_mode",
        available: true,
        unsupported: false,
        ai_overview_triggered: null,
        ai_mentioned: true,
        ai_cited: false,
        organic_rank: null,
        local_pack_rank: null,
        maps_rank: null,
        confidence: "medium",
        matched_by: ["brand_alias"],
        competitors_above: ["Competitor Cafe"],
      },
    ]));

    expect(result.findings.some((f) => f.finding_key === "aeo.ai_citation_missing")).toBe(true);
    expect(result.findings.some((f) => f.finding_key === "aeo.ai_overview_missing")).toBe(false);
  });

  it("penalizes poor Maps visibility for local-intent runs", () => {
    const result = scoreAEO(basePayload([
      {
        query: "銅鑼灣 cafe 推薦",
        query_type: "maps",
        engine: "google_maps",
        available: true,
        unsupported: false,
        ai_overview_triggered: null,
        ai_mentioned: false,
        ai_cited: false,
        organic_rank: null,
        local_pack_rank: null,
        maps_rank: 9,
        confidence: "high",
        matched_by: ["place_id"],
        competitors_above: ["Cafe A", "Cafe B", "Cafe C"],
      },
    ]));

    // Graded model: rank 9 is in the local pack but below the top 3 → "visible but low" (-8 info).
    const finding = result.findings.find((f) => f.finding_key === "aeo.maps_visibility_poor");
    expect(finding?.severity).toBe("info");
    expect(finding?.score_impact).toBe(-8);
    expect(finding?.evidence).toMatchObject({ best_maps_rank: 9 });
  });

  it("excludes unavailable and unsupported runs from rate calculations", () => {
    const result = scoreAEO(basePayload([
      {
        query: "unsupported ai mode",
        query_type: "need",
        engine: "google_ai_mode",
        available: true,
        unsupported: true,
        ai_overview_triggered: null,
        ai_mentioned: false,
        ai_cited: false,
        organic_rank: null,
        local_pack_rank: null,
        maps_rank: null,
        confidence: "none",
        matched_by: [],
        competitors_above: [],
      },
      {
        query: "timeout",
        query_type: "discovery",
        engine: "google",
        available: false,
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
      },
    ]));

    expect(result.findings.some((f) => f.finding_key === "aeo.ai_citation_missing")).toBe(false);
    // With every run unavailable/unsupported there is no usable evidence on any surface.
    expect(result).toMatchObject({
      status: "unavailable",
      score: null,
      confidence: "none",
      limitationCode: "AEO_NOT_MEASURED",
    });
    expect(result.findings).toEqual([]);  });

  it("does not treat google runs without AI output as citation denominator entries", () => {
    const result = scoreAEO(basePayload([
      {
        query: "cafe hong kong",
        query_type: "discovery",
        engine: "google",
        available: true,
        unsupported: false,
        ai_overview_triggered: false,
        ai_mentioned: false,
        ai_cited: false,
        organic_rank: 3,
        local_pack_rank: null,
        maps_rank: null,
        confidence: "none",
        matched_by: [],
        competitors_above: [],
      },
      {
        query: "best cafe hong kong",
        query_type: "discovery",
        engine: "google",
        available: true,
        unsupported: false,
        ai_overview_triggered: false,
        ai_mentioned: false,
        ai_cited: false,
        organic_rank: 4,
        local_pack_rank: null,
        maps_rank: null,
        confidence: "none",
        matched_by: [],
        competitors_above: [],
      },
    ]));

    expect(result.findings.find((f) => f.finding_key === "aeo.ai_citation_missing")).toBeUndefined();
  });

  it("does not emit critical FAQ schema finding", () => {
    const result = scoreAEO(basePayload([]));
    expect(result.findings.find((f) => f.finding_key === "aeo.website_no_faq_schema")).toBeUndefined();
  });

  it("credits a high-confidence AI citation (no ai_citation_missing finding)", () => {
    const result = scoreAEO(basePayload([
      {
        query: "銅鑼灣 cafe 推薦",
        query_type: "discovery",
        engine: "google",
        available: true,
        unsupported: false,
        ai_overview_triggered: true,
        ai_answered: true,
        ai_mentioned: true,
        ai_cited: true,
        organic_rank: 2,
        local_pack_rank: null,
        maps_rank: null,
        confidence: "high",
        matched_by: ["domain"],
        competitors_above: [],
      },
    ]));

    expect(result.findings.some((f) => f.finding_key === "aeo.ai_citation_missing")).toBe(false);
  });

  it("does not credit a low- or none-confidence AI citation (penalty still fires)", () => {
    for (const confidence of ["low", "none"] as const) {
      const result = scoreAEO(basePayload([
        {
          query: "銅鑼灣 cafe 推薦",
          query_type: "discovery",
          engine: "google",
          available: true,
          unsupported: false,
          ai_overview_triggered: true,
          ai_answered: true,
          ai_mentioned: true,
          ai_cited: true,
          organic_rank: 2,
          local_pack_rank: null,
          maps_rank: null,
          confidence,
          matched_by: [],
          competitors_above: [],
        },
      ]));

      expect(result.findings.some((f) => f.finding_key === "aeo.ai_citation_missing")).toBe(true);
    }
  });

  it("does not penalize an AI Mode run that produced no answer", () => {
    const result = scoreAEO(basePayload([
      {
        query: "附近有咩 cafe 推薦",
        query_type: "need",
        engine: "google_ai_mode",
        available: true,
        unsupported: false,
        ai_overview_triggered: null,
        ai_answered: false,
        ai_mentioned: false,
        ai_cited: false,
        organic_rank: null,
        local_pack_rank: null,
        maps_rank: null,
        confidence: "none",
        matched_by: [],
        competitors_above: [],
      },
    ]));

    expect(result.findings.some((f) => f.finding_key === "aeo.ai_citation_missing")).toBe(false);
  });

  it("excludes the self-brand query when judging organic search visibility", () => {
    const result = scoreAEO(basePayload([
      {
        query: "best cafe in Causeway Bay Hong Kong",
        query_type: "discovery",
        engine: "google",
        available: true,
        unsupported: false,
        ai_overview_triggered: true,
        ai_answered: true,
        ai_mentioned: false,
        ai_cited: true,
        organic_rank: null,
        local_pack_rank: null,
        maps_rank: null,
        confidence: "high",
        matched_by: ["domain"],
        competitors_above: [],
      },
      {
        query: "Happy Cafe Hong Kong",
        query_type: "brand",
        engine: "google",
        available: true,
        unsupported: false,
        ai_overview_triggered: false,
        ai_answered: false,
        ai_mentioned: true,
        ai_cited: true,
        organic_rank: 1,
        local_pack_rank: null,
        maps_rank: null,
        confidence: "high",
        matched_by: ["domain"],
        competitors_above: [],
      },
    ]));

    const finding = result.findings.find((f) => f.finding_key === "aeo.search_visibility_poor");
    expect(finding).toBeDefined();
    expect(finding?.evidence).toMatchObject({ avg_organic_rank: null });
  });

  it("counts a competitor once per run even when it appears twice in one query", () => {
    const result = scoreAEO(basePayload([
      {
        query: "銅鑼灣 cafe 推薦",
        query_type: "discovery",
        engine: "google",
        available: true,
        unsupported: false,
        ai_overview_triggered: true,
        ai_answered: true,
        ai_mentioned: true,
        ai_cited: true,
        organic_rank: 2,
        local_pack_rank: 1,
        maps_rank: null,
        confidence: "high",
        matched_by: ["domain"],
        // Same competitor surfaced in both the organic results and the local pack of ONE query.
        competitors_above: ["Rival Cafe", "Rival Cafe"],
      },
    ]));

    expect(result.findings.some((f) => f.finding_key === "aeo.competitor_gap")).toBe(false);
  });

  it("flags a competitor that outranks the merchant across separate runs", () => {
    const result = scoreAEO(basePayload([
      {
        query: "銅鑼灣 cafe 推薦",
        query_type: "discovery",
        engine: "google",
        available: true,
        unsupported: false,
        ai_overview_triggered: true,
        ai_answered: true,
        ai_mentioned: true,
        ai_cited: true,
        organic_rank: 2,
        local_pack_rank: null,
        maps_rank: null,
        confidence: "high",
        matched_by: ["domain"],
        competitors_above: ["Rival Cafe"],
      },
      {
        query: "best cafe causeway bay",
        query_type: "discovery",
        engine: "google",
        available: true,
        unsupported: false,
        ai_overview_triggered: true,
        ai_answered: true,
        ai_mentioned: true,
        ai_cited: true,
        organic_rank: 3,
        local_pack_rank: null,
        maps_rank: null,
        confidence: "high",
        matched_by: ["domain"],
        competitors_above: ["Rival Cafe"],
      },
    ]));

    expect(result.findings.some((f) => f.finding_key === "aeo.competitor_gap")).toBe(true);
  });
});
