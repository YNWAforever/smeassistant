import { describe, expect, it } from "vitest";
import { sanitizeReportProof } from "./sanitize-proof";

function rawWithCompetitor(competitor: Record<string, unknown>) {
  return {
    aeo: {
      merchant_performance: {
        generated_at: "2026-08-13T00:00:00.000Z",
        runs: [{
          query: "cafe hong kong",
          engine: "google_maps",
          merchant_presence: {
            found: true, confidence: "high", ai_mentioned: false, ai_cited: false,
            organic_rank: null, local_pack_rank: null, maps_rank: 2,
            maps_rating: 4.1, maps_reviews: 8,
          },
          competitors: [competitor],
          evidence_snippets: [],
        }],
      },
    },
  };
}

describe("sanitizeReportProof competitor fields", () => {
  it("carries competitor rating and review count into the view model", () => {
    const proof = sanitizeReportProof(
      rawWithCompetitor({ name: "Rival Cafe", source: "maps", rank: 1, rating: 4.6, reviews: 87 }),
      [],
    );

    expect(proof.merchant?.runs[0].competitors[0]).toEqual({
      name: "Rival Cafe", source: "maps", rank: 1, rating: 4.6, reviews: 87,
    });
  });

  it("carries the merchant's own maps rating and reviews", () => {
    const proof = sanitizeReportProof(rawWithCompetitor({ name: "Rival Cafe", source: "maps", rank: 1 }), []);
    const run = proof.merchant?.runs[0];

    expect(run?.mapsRating).toBe(4.1);
    expect(run?.mapsReviews).toBe(8);
  });

  it("nulls non-numeric and absent values rather than trusting the provider", () => {
    const proof = sanitizeReportProof(
      rawWithCompetitor({ name: "Rival Cafe", source: "maps", rank: 1, rating: "4.6", reviews: null }),
      [],
    );

    expect(proof.merchant?.runs[0].competitors[0]).toMatchObject({ rating: null, reviews: null });
  });

  it("bounds a hostile competitor name to 160 characters", () => {
    const proof = sanitizeReportProof(
      rawWithCompetitor({ name: "x".repeat(5000), source: "maps", rank: 1, rating: 4.6, reviews: 87 }),
      [],
    );

    expect(proof.merchant?.runs[0].competitors[0].name).toHaveLength(160);
  });
});
