import { describe, expect, it, vi } from "vitest";
import { scoreAll } from "@sme-scanner/scoring";
import { createScanProcessor } from "./processor";

/**
 * The collector's confidence must reach the persisted module result.
 *
 * The pure scorer cannot know which provider answered, so it emits a flat
 * "medium" for every measured module. The collector does know — gbp-collector
 * reports "high" for Google Places New and "medium" for the SerpApi fallback — and
 * normalizeProviderModule used to discard it by returning the scorer's object
 * unchanged. The report already renders a confidence legend, so it displayed the
 * same word whether the evidence was first-party quality or a degraded fallback.
 *
 * This is what makes a Confidence Score real without a single OAuth token.
 */

const job = {
  id: "job-1",
  business_name: "Demo Coffee",
  ig_handle: "demo.coffee",
  website_url: "https://example.com",
  industry: "Cafe",
  district: "Central",
  region: "hk",
};

const IG_AT = "2026-07-20T01:00:00.000Z";
const GBP_AT = "2026-07-20T02:00:00.000Z";
const AEO_AT = "2026-07-20T03:00:00.000Z";

function collection(gbpConfidence: "high" | "medium" | "low") {
  return {
    ig: {
      status: "measured" as const,
      confidence: "medium" as const,
      collectedAt: IG_AT,
      data: {
        available: true,
        username: "demo.coffee",
        bio: "Coffee and pastries in Central. Visit us today.",
        followers: 900,
        following: 10,
        posts_count: 30,
        external_url: "https://example.com",
        posts_last_12: [
          {
            id: "post-1",
            caption: "Fresh coffee",
            media_type: "GraphImage",
            like_count: 40,
            comment_count: 5,
            posted_at: new Date().toISOString(),
          },
        ],
        reels_count: 3,
        highlights_count: 3,
        stories_count: 1,
      },
    },
    gbp: {
      status: "measured" as const,
      confidence: gbpConfidence,
      collectedAt: GBP_AT,
      data: {
        available: true,
        place_id: "place-1",
        name: "Demo Coffee",
        rating: 4.7,
        reviews_count: 142,
        reviews: [
          { rating: 5, text: "Great coffee", time: new Date().toISOString(), owner_response: "Thank you" },
        ],
        photos_count: 30,
        hours_complete: true,
        categories: ["cafe"],
        recent_posts_count: 2,
      },
    },
    aeo: {
      status: "measured" as const,
      confidence: "medium" as const,
      collectedAt: AEO_AT,
      data: {
        available: true,
        serpapi_runs: [
          {
            query: "best coffee Central",
            ai_overview_mentioned: true,
            ai_mode_mentioned: true,
            brand_organic_rank: 1,
            competitors_mentioned: [],
          },
        ],
        website: { available: true, has_faq_schema: true, meta_description_len: 120, h1_count: 1 },
      },
    },
  };
}

type PersistedModules = Record<string, { confidence?: string; evidenceCollectedAt?: string | null }>;

async function runWith(gbpConfidence: "high" | "medium" | "low"): Promise<PersistedModules> {
  let moduleResults: PersistedModules | undefined;
  const process = createScanProcessor({
    claimJob: vi.fn().mockResolvedValue(job),
    collect: vi.fn().mockResolvedValue(collection(gbpConfidence)),
    score: (payload) => scoreAll(payload),
    persist: vi.fn().mockImplementation(async (persistence: { moduleResults: PersistedModules }) => {
      moduleResults = persistence.moduleResults;
    }),
    fail: vi.fn(),
    setStage: vi.fn(),
    recordTerminal: vi.fn(),
    persistEvidence: vi.fn(),
  });
  await process("job-1");
  // Fail loudly rather than returning {} — an empty object would make every
  // assertion below silently vacuous.
  if (!moduleResults) throw new Error("persist was never called; the scan did not reach persistence");
  return moduleResults;
}

describe("provider confidence reaches the persisted module result", () => {
  it("records high confidence when the primary GBP provider answered", async () => {
    const modules = await runWith("high");
    expect(modules.gbp?.confidence).toBe("high");
  });

  it("records medium confidence when the SerpApi fallback answered", async () => {
    const modules = await runWith("medium");
    expect(modules.gbp?.confidence).toBe("medium");
  });

  it("distinguishes the two, rather than reporting one flat value", async () => {
    // The regression this guards: normalizeProviderModule returned the scorer's
    // object unchanged, so both providers produced the identical "medium".
    const [high, medium] = await Promise.all([runWith("high"), runWith("medium")]);
    expect(high.gbp?.confidence).not.toBe(medium.gbp?.confidence);
  });

  it("carries each provider's own capture time, not a single scan timestamp", async () => {
    const modules = await runWith("high");
    expect(modules.gbp?.evidenceCollectedAt).toBe(GBP_AT);
    expect(modules.ig?.evidenceCollectedAt).toBe(IG_AT);
    expect(modules.aeo?.evidenceCollectedAt).toBe(AEO_AT);
  });
});
