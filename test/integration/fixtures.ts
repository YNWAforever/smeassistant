import type { ScanProviderCollection } from "@sme-scanner/scan-engine";
const COLLECTED_AT = "2026-08-11T00:00:00.000Z";

const measuredIg = {
  status: "measured" as const,
  confidence: "high" as const,
  collectedAt: COLLECTED_AT,
  data: {
    available: true,
    username: "integration.cafe",
    bio: "Coffee in Central. Open daily.",
    followers: 1200,
    following: 80,
    posts_count: 40,
    external_url: "https://example.com",
    posts_last_12: [
      {
        id: "post-1",
        caption: "Fresh coffee",
        media_type: "GraphImage",
        like_count: 30,
        comment_count: 4,
        posted_at: "2026-08-10T00:00:00.000Z",
      },
    ],
    reels_count: 2,
  },
};

const measuredGbp = {
  status: "measured" as const,
  confidence: "high" as const,
  collectedAt: COLLECTED_AT,
  data: {
    available: true,
    name: "Integration Cafe",
    rating: 4.5,
    reviews_count: 210,
    photos_count: 30,
    hours_complete: true,
    categories: ["Cafe"],
  },
};

const measuredAeo = {
  status: "measured" as const,
  confidence: "medium" as const,
  collectedAt: COLLECTED_AT,
  data: {
    available: true,
    serpapi_runs: [
      {
        query: "best cafe central hong kong",
        ai_overview_mentioned: true,
        ai_mode_mentioned: false,
        brand_organic_rank: 3,
        competitors_mentioned: [],
      },
    ],
  },
};

/** Deterministic collector data; no remote providers or evidence downloads. */
export function fakeProviders(
  overrides: Partial<ScanProviderCollection> = {},
): ScanProviderCollection {
  return {
    ig: measuredIg,
    gbp: measuredGbp,
    aeo: measuredAeo,
    ...overrides,
  } as ScanProviderCollection;
}

export const unavailable = (limitationCode: string) =>
  ({ status: "unavailable" as const, limitationCode });

export const failed = (limitationCode: string) =>
  ({ status: "failed" as const, limitationCode, retryable: false });
