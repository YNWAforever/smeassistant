import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchGoogleSearchWithAiOverview,
  processScan,
  collectScanProviders,
  scrapeGBP,
  hasUsableAeoEvidence,
} from "@sme-scanner/scan-engine";
import type { RawData } from "@sme-scanner/contracts";
import type { EvidenceCandidate } from "@sme-scanner/contracts";
import { POST } from "./route";
import type { AEOPayload } from "@sme-scanner/scoring";
const limiterMocks = vi.hoisted(() => ({
  enforceCompositeIdentifierRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 1 })),
}));


vi.mock("@sme-scanner/scan-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sme-scanner/scan-engine")>();
  return { ...actual, processScan: vi.fn() };
});
vi.mock("@/lib/security/rate-limit", () => ({
  enforceCompositeIdentifierRateLimit: limiterMocks.enforceCompositeIdentifierRateLimit,
  rateLimitedResponse: vi.fn(() => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 })),
}));
const supabaseMocks = vi.hoisted(() => ({ supabaseServer: vi.fn(() => ({ marker: "fake-client" })) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: supabaseMocks.supabaseServer }));

// Under vitest lib/scan/run.ts defaults to the fixture collector (CLAUDE.md
// 3.2.1). This file exercises the real collectScanProviders through the route
// with stubbed fetch, so pin the live collector. Assigned directly rather than
// via vi.stubEnv: several tests below call vi.unstubAllEnvs(), which would
// drop a stub but leaves a plain assignment alone.
process.env.SCAN_SOURCES = "live";


describe("scan process route", () => {
  it("rejects non-UUID job IDs before invoking the processor", async () => {
    const response = await POST(new Request("http://localhost/api/scan/process", {
      method: "POST",
      body: JSON.stringify({ jobId: "not-a-uuid" }),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(400);
    expect(processScan).not.toHaveBeenCalled();
    expect(limiterMocks.enforceCompositeIdentifierRateLimit).not.toHaveBeenCalled();
  });

  it("passes a valid UUID to the processor and returns its terminal status", async () => {
    vi.mocked(processScan).mockResolvedValueOnce({ status: "partial" });
    const response = await POST(new Request("http://localhost/api/scan/process", {
      method: "POST",
      body: JSON.stringify({ jobId: "00000000-0000-4000-8000-000000000001" }),
      headers: { "content-type": "application/json", cookie: "sme_analytics_session=11111111-1111-4111-8111-111111111111" },
    }));
    expect(response.status).toBe(200);
    expect(limiterMocks.enforceCompositeIdentifierRateLimit).toHaveBeenCalledWith(expect.objectContaining({
      scope: "scan_process",
      identifier: "00000000-0000-4000-8000-000000000001",
    }));
    expect(processScan).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      "11111111-1111-4111-8111-111111111111",
      expect.any(Function),
      expect.any(Function),
      { marker: "fake-client" },
    );
    await expect(response.json()).resolves.toEqual({ status: "partial" });
  });

  it("does not construct a Supabase client for a rate-limited request", async () => {
    supabaseMocks.supabaseServer.mockClear();
    vi.mocked(processScan).mockClear();
    limiterMocks.enforceCompositeIdentifierRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 5,
    });
    const response = await POST(new Request("http://localhost/api/scan/process", {
      method: "POST",
      body: JSON.stringify({ jobId: "00000000-0000-4000-8000-000000000001" }),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(429);
    expect(processScan).not.toHaveBeenCalled();
    expect(supabaseMocks.supabaseServer).not.toHaveBeenCalled();
  });
});


describe("scan process route runtime switch", () => {
  const JOB_ID = "11111111-2222-4333-8444-555555555555";

  // Every other describe block in this file runs with the runtime switch
  // unset (vercel). vi.stubEnv persists across tests within a file until
  // unstubbed, so leaving SCAN_EXECUTION_RUNTIME=cloudflare stubbed here
  // silently routed later tests -- which call POST and expect processScan to
  // run inline -- into dispatchToScanWorker instead. Same for the stubbed
  // fetch global.
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function post(): Request {
    return new Request("http://localhost/api/scan/process", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: JOB_ID }),
    });
  }

  it("runs the scan inline when the runtime is vercel", async () => {
    vi.stubEnv("SCAN_EXECUTION_RUNTIME", "vercel");
    vi.mocked(processScan).mockResolvedValueOnce({ status: "done" } as never);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(post());

    expect(response.status).toBe(200);
    expect(processScan).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dispatches to the worker and 202s without scanning when the runtime is cloudflare", async () => {
    vi.stubEnv("SCAN_EXECUTION_RUNTIME", "cloudflare");
    vi.stubEnv("SCAN_WORKER_URL", "https://scan-worker.example");
    vi.stubEnv("CRON_SECRET", "d".repeat(32));
    vi.mocked(processScan).mockClear();
    const fetchMock = vi.fn(async () => new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(post());

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(processScan).not.toHaveBeenCalled();
  });

  it("still 500s a failed scan when the runtime is vercel, matching the pre-L6 contract", async () => {
    // The design's own testing note: "the route's existing 500-on-failed
    // branch still gets a test under both switch values rather than being
    // assumed dead." Nothing else in this describe block exercises `failed`
    // -- the two branch tests above only cover `done`, so a regression that
    // dropped the `result.status === "failed" ? 500 : 200` ternary entirely
    // (collapsing to always-200) would pass every other test in this file.
    vi.stubEnv("SCAN_EXECUTION_RUNTIME", "vercel");
    vi.mocked(processScan).mockResolvedValueOnce({ status: "failed" } as never);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(post());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ status: "failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("502s without scanning when the worker rejects the dispatch", async () => {
    // Regression: `{ status: accepted ? 202 : 502 }` collapsed to a bare 202
    // kept every other test in this file green -- nothing here previously
    // exercised the rejected-dispatch branch. A silent 202 on a job the
    // Worker never accepted would make the scanning page poll forever with
    // no operator signal that dispatch failed.
    vi.stubEnv("SCAN_EXECUTION_RUNTIME", "cloudflare");
    vi.stubEnv("SCAN_WORKER_URL", "https://scan-worker.example");
    vi.stubEnv("CRON_SECRET", "d".repeat(32));
    vi.mocked(processScan).mockClear();
    const fetchMock = vi.fn(async () => new Response("nope", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(post());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ accepted: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(processScan).not.toHaveBeenCalled();
  });
});


describe("fetchGoogleSearchWithAiOverview", () => {
  it("follows ai_overview.page_token and merges the dedicated AI Overview response", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({
        search_metadata: { status: "Success", id: "search-id", total_time_taken: 1.1 },
        ai_overview: {
          page_token: "page-token-123",
          references: [{ title: "Search ref", link: "https://search.example/ref" }],
        },
        organic_results: [{ title: "Happy Cafe", link: "https://happycafe.hk", snippet: "Official", position: 1 }],
      })
      .mockResolvedValueOnce({
        search_metadata: { status: "Success", id: "overview-id", total_time_taken: 0.7 },
        ai_overview: {
          text_blocks: [{ snippet: "Happy Cafe is a popular lunch option." }],
          references: [{ title: "Happy Cafe", link: "https://happycafe.hk/menu" }],
        },
      });

    const data = await fetchGoogleSearchWithAiOverview(
      {
        engine: "google",
        q: "happy cafe",
        hl: "en",
        gl: "hk",
        location: "Hong Kong",
        device: "desktop",
        api_key: "search-key",
        num: "10",
      },
      "test-serp-key",
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      {
        engine: "google_ai_overview",
        page_token: "page-token-123",
        api_key: "test-serp-key",
      },
      20000,
    );
    expect(data.ai_overview).toMatchObject({
      page_token: "page-token-123",
      text_blocks: [{ snippet: "Happy Cafe is a popular lunch option." }],
      references: [{ title: "Happy Cafe", link: "https://happycafe.hk/menu" }],
    });
    expect(data.organic_results).toEqual([
      { title: "Happy Cafe", link: "https://happycafe.hk", snippet: "Official", position: 1 },
    ]);
  });

  it("merges the follow-up AI Overview when the token is root-level and ai_overview is initially missing", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({
        search_metadata: { status: "Success", id: "search-root-token-id", total_time_taken: 1.0 },
        ai_overview_page_token: "root-page-token-456",
        organic_results: [{ title: "Happy Cafe", link: "https://happycafe.hk", snippet: "Official", position: 1 }],
      })
      .mockResolvedValueOnce({
        search_metadata: { status: "Success", id: "overview-root-token-id", total_time_taken: 0.6 },
        ai_overview: {
          text_blocks: [{ snippet: "Happy Cafe appears in the AI Overview." }],
          references: [{ title: "Happy Cafe", link: "https://happycafe.hk/about" }],
        },
      });

    const data = await fetchGoogleSearchWithAiOverview(
      {
        engine: "google",
        q: "happy cafe causeway bay",
        hl: "en",
        gl: "hk",
        location: "Hong Kong",
        device: "desktop",
        api_key: "search-key",
        num: "10",
      },
      "test-serp-key",
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      {
        engine: "google_ai_overview",
        page_token: "root-page-token-456",
        api_key: "test-serp-key",
      },
      20000,
    );
    expect(data.ai_overview).toMatchObject({
      page_token: "root-page-token-456",
      text_blocks: [{ snippet: "Happy Cafe appears in the AI Overview." }],
      references: [{ title: "Happy Cafe", link: "https://happycafe.hk/about" }],
    });
    expect(data.organic_results).toEqual([
      { title: "Happy Cafe", link: "https://happycafe.hk", snippet: "Official", position: 1 },
    ]);
  });
});

describe("scan process route boundaries", () => {
  it("uses a confirmed Place ID without repeating text search", async () => {
    process.env.GOOGLE_PLACES_KEY = "test-google-key";
    // Both spellings, or a developer with only the preferred name exported would
    // hand these cases a live SerpApi key and a different code path.
    delete process.env.SERPAPI_KEY;
    delete process.env.SERPAPI_API_KEY;
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "confirmed-place-id",
      displayName: { text: "Dialogue In The Dark Exhibition" },
      formattedAddress: "D2 Place ONE",
      rating: 4.5,
      userRatingCount: 100,
      reviews: [],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    const result = await scrapeGBP(
      "Dialogue In The Dark Exhibition",
      "Lai Chi Kok",
      "hk",
      {
        placeId: "confirmed-place-id",
        dataId: null,
        dataCid: null,
        mapsUrl: null,
        address: null,
        alternateNames: [],
      },
    );

    expect(result.provider).toMatchObject({ status: "measured", data: { available: true } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("/v1/places/confirmed-place-id");
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_PLACES_KEY;
  });

  it("does not query Places without a confirmed Place ID", async () => {
    process.env.GOOGLE_PLACES_KEY = "test-google-key";
    // Both spellings, or a developer with only the preferred name exported would
    // hand these cases a live SerpApi key and a different code path.
    delete process.env.SERPAPI_KEY;
    delete process.env.SERPAPI_API_KEY;
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const result = await scrapeGBP(
      "Dialogue In The Dark Exhibition",
      "Lai Chi Kok",
      "hk",
      {
        placeId: null,
        dataId: null,
        dataCid: null,
        mapsUrl: null,
        address: "D2 Place ONE",
        alternateNames: ["Dialogue Experience"],
      },
    );

    expect(result.provider).toEqual({
      status: "failed",
      limitationCode: "GOOGLE_PLACES_IDENTITY_MISSING",
      retryable: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_PLACES_KEY;
  });


  it("retains safe story fields and derives Instagram permalinks from provider codes", async () => {
    process.env.RAPIDAPI_INSTAGRAM_KEY = "test-instagram-key";
    delete process.env.GOOGLE_PLACES_KEY;
    // Both spellings, or a developer with only the preferred name exported would
    // hand these cases a live SerpApi key and a different code path.
    delete process.env.SERPAPI_KEY;
    delete process.env.SERPAPI_API_KEY;

    let collectedRaw: RawData | undefined;
    let collectedStoriesCount: number | undefined;
    let collectedEvidence: EvidenceCandidate[] | undefined;
    vi.mocked(processScan).mockImplementationOnce(async (_jobId, _sessionId, collect) => {
      const collected = await collect({
        id: "00000000-0000-4000-8000-000000000001",
        business_name: "Demo Cafe",
        ig_handle: "demo.cafe",
        ig_match_provenance: null,
        website_url: null,
        industry: null,
        district: null,
        region: "hk",
        merchant_evidence: {
          placeId: null,
          dataId: null,
          dataCid: null,
          mapsUrl: null,
          address: null,
          alternateNames: [],
        },
      }, async () => undefined);
      collectedRaw = collected.raw as RawData;
      collectedEvidence = collected.evidence;
      collectedStoriesCount = collected.ig.status === "measured"
        ? collected.ig.data.stories_count
        : undefined;
      return { status: "partial" };
    });

    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("ig_get_fb_profile.php")) {
        return new Response(JSON.stringify({
          user_data: {
            id: "profile-id",
            username: "demo.cafe",
            full_name: "Demo Cafe",
            biography: "Cafe",
            follower_count: 120,
            following_count: 30,
            media_count: 20,
            is_private: false,
            is_verified: false,
            profile_pic_url: "https://images.example/profile.jpg",
          },
        }), { status: 200 });
      }
      if (url.includes("get_ig_user_posts.php")) {
        return new Response(JSON.stringify({
          posts: [{
            id: "post-provider-id",
            code: "POST_CODE",
            caption: "Post",
            taken_at: 1_784_505_600,
            like_count: 5,
            comment_count: 1,
            image_versions2: { candidates: [{ url: "https://images.example/post.jpg" }] },
          }],
        }), { status: 200 });
      }
      if (url.includes("get_ig_user_reels.php")) {
        return new Response(JSON.stringify({
          reels: [{
            node: {
              media: {
                id: "reel-provider-id",
                code: "REEL_CODE",
                caption: { text: "Reel" },
                taken_at: 1_784_505_600,
                play_count: 12,
                like_count: 5,
                comment_count: 1,
                image_versions2: { candidates: [{ url: "https://images.example/reel.jpg" }] },
              },
            },
          }],
        }), { status: 200 });
      }
      if (url.includes("get_ig_user_highlights.php")) {
        return new Response(JSON.stringify({ highlights: [] }), { status: 200 });
      }
      if (url.includes("get_ig_user_stories.php")) {
        return new Response(JSON.stringify({
          items: [{
            node: {
              media: {
                pk: "story-provider-id",
                media_type: 2,
                taken_at: 1_784_505_600,
                image_versions2: { candidates: [{ url: "https://images.example/story.jpg" }] },
                api_key: "must-not-survive",
                raw_body: { secret: "must-not-survive" },
              },
            },
          }, {
            id: " ",
            media_type: 1,
            taken_at: 1_784_505_600,
            thumbnail_url: "https://images.example/blank-id.jpg",
          }, {
            id: "story-extreme-date",
            media_type: 1,
            taken_at: 1e300,
            thumbnail_url: "https://images.example/extreme-date.jpg",
          }, {
            id: "story-whitespace-time",
            media_type: 1,
            taken_at: "   ",
            thumbnail_url: "https://images.example/whitespace-time.jpg",
          }, ...Array.from({ length: 21 }, (_, index) => ({
            id: `overflow-story-${index}`,
            media_type: 1,
            taken_at: 1_784_505_600,
            thumbnail_url: `https://images.example/overflow-${index}.jpg`,
          }))],
          debug_token: "must-not-survive",
        }), { status: 200 });
      }
      throw new Error("unexpected fetch: " + url);
    });
    vi.stubGlobal("fetch", fetcher);

    try {
      const response = await POST(new Request("http://localhost/api/scan/process", {
        method: "POST",
        body: JSON.stringify({ jobId: "00000000-0000-4000-8000-000000000001" }),
        headers: { "content-type": "application/json" },
      }));

      expect(response.status).toBe(200);
      expect(collectedRaw?.ig?.posts[0]?.permalink).toBe(
        "https://www.instagram.com/p/POST_CODE/",
      );
      expect(collectedRaw?.ig?.reels[0]?.permalink).toBe(
        "https://www.instagram.com/reel/REEL_CODE/",
      );
      expect.soft(collectedRaw?.ig?.stories?.slice(0, 3)).toEqual([{
        id: "story-provider-id",
        media_type: "GraphVideo",
        thumbnail_url: "https://images.example/story.jpg",
        posted_at: new Date(1_784_505_600 * 1000).toISOString(),
        permalink: "https://www.instagram.com/stories/demo.cafe/story-provider-id/",
      }, {
        id: "story-extreme-date",
        media_type: "GraphImage",
        thumbnail_url: "https://images.example/extreme-date.jpg",
        posted_at: "",
        permalink: "https://www.instagram.com/stories/demo.cafe/story-extreme-date/",
      }, {
        id: "story-whitespace-time",
        media_type: "GraphImage",
        thumbnail_url: "https://images.example/whitespace-time.jpg",
        posted_at: "",
        permalink: "https://www.instagram.com/stories/demo.cafe/story-whitespace-time/",
      }]);
      expect(collectedEvidence).toEqual(expect.arrayContaining([
        expect.objectContaining({
          provider: "instagram",
          evidenceType: "profile",
          sourceId: "demo.cafe",
        }),
        expect.objectContaining({
          provider: "instagram",
          evidenceType: "post",
          sourceId: "post-provider-id",
          sourceUrl: "https://www.instagram.com/p/POST_CODE/",
        }),
        expect.objectContaining({
          provider: "instagram",
          evidenceType: "story",
          sourceId: "story-provider-id",
          sourceUrl: "https://www.instagram.com/stories/demo.cafe/story-provider-id/",
        }),
      ]));
      expect(collectedRaw?.ig?.stories).toHaveLength(19);
      expect.soft(collectedRaw?.ig?.stories?.[2]?.posted_at).toBe("");
      expect.soft(collectedStoriesCount).toBe(25);
      expect(JSON.stringify(collectedRaw?.ig)).not.toMatch(
        /must-not-survive|api_key|raw_body|debug/i,
      );
    } finally {
      vi.unstubAllGlobals();
      delete process.env.RAPIDAPI_INSTAGRAM_KEY;
    }
  });

  it("exports POST only", async () => {
    const route = await import("./route");
    expect(route).not.toHaveProperty("GET");
  });

  it("rejects an AEO payload when all SerpAPI runs are unusable", () => {
    const payload = {
      available: true,
      serpapi_runs: [],
      performance_runs: [{
        query: "best cafe",
        query_type: "discovery",
        engine: "google",
        available: false,
        unsupported: false,
        ai_overview_triggered: false,
        ai_answered: false,
        ai_mentioned: false,
        ai_cited: false,
        organic_rank: null,
        local_pack_rank: null,
        maps_rank: null,
        confidence: "none",
        matched_by: [],
        competitors_above: [],
      }],
      website: { available: false },
    } as AEOPayload;

    expect(hasUsableAeoEvidence(payload)).toBe(false);
  });

  it("accepts website evidence even when no SerpAPI run is usable", () => {
    expect(hasUsableAeoEvidence({
      available: true,
      serpapi_runs: [],
      performance_runs: [],
      website: { available: true },
    })).toBe(true);
  });

  it("treats an AEO failure as retryable when only SERPAPI_API_KEY is set", async () => {
    // runSerpAEO picks its key through the shared resolver, which honours both
    // names. The configured flag used to read SERPAPI_KEY on its own, so the two
    // disagreed: the collector ran with a real key, failed for a real reason, and
    // the module was still reported NOT_CONFIGURED and non-retryable.
    delete process.env.RAPIDAPI_INSTAGRAM_KEY;
    delete process.env.GOOGLE_PLACES_KEY;
    vi.stubEnv("SERPAPI_KEY", "");
    vi.stubEnv("SERPAPI_API_KEY", "preferred-serp-key");

    let aeo: unknown;
    vi.mocked(processScan).mockImplementationOnce(async (_jobId, _sessionId, collect) => {
      const collected = await collect({
        id: "00000000-0000-4000-8000-000000000001",
        business_name: "Demo Cafe",
        ig_handle: null,
        ig_match_provenance: null,
        website_url: null,
        industry: null,
        district: null,
        region: "hk",
        merchant_evidence: {
          placeId: null, dataId: null, dataCid: null, mapsUrl: null, address: null, alternateNames: [],
        },
      }, async () => undefined);
      aeo = collected.aeo;
      return { status: "partial" };
    });

    // 400 is one of the statuses SerpApi handling refuses to retry, which keeps
    // this test off the 3-attempt backoff path.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ error: "Bad request." }),
      { status: 400, headers: { "content-type": "application/json" } },
    )));

    try {
      await POST(new Request("http://localhost/api/scan/process", {
        method: "POST",
        body: JSON.stringify({ jobId: "00000000-0000-4000-8000-000000000001" }),
        headers: { "content-type": "application/json" },
      }));

      expect(aeo).toMatchObject({
        status: "failed",
        limitationCode: "AEO_PROVIDER_FAILED",
        retryable: true,
      });
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});

describe("collectScanProviders wires the real per-module confidence graders", () => {
  // Regression: toProvider used to hardcode confidence: "medium" for every
  // measured payload regardless of collector. gbp already carried its real
  // confidence (provider-confidence.test.ts); ig and aeo did not — production
  // verification on 2026-08-01 saw "medium" on every measured module across
  // two scans and never once saw "high". These assert the exact grade the
  // grader would produce, not merely that it differs from the old literal.
  const baseJob = {
    id: "00000000-0000-4000-8000-000000000001",
    business_name: "Demo Cafe",
    ig_match_provenance: null,
    industry: null,
    district: null,
    region: "hk",
    merchant_evidence: {
      placeId: null,
      dataId: null,
      dataCid: null,
      mapsUrl: null,
      address: null,
      alternateNames: [],
    },
  };

  it("grades ig confidence high when the collected payload has posts and a bio", async () => {
    process.env.RAPIDAPI_INSTAGRAM_KEY = "test-instagram-key";
    delete process.env.GOOGLE_PLACES_KEY;
    delete process.env.SERPAPI_KEY;
    delete process.env.SERPAPI_API_KEY;

    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("ig_get_fb_profile.php")) {
        return new Response(JSON.stringify({
          user_data: {
            id: "profile-id",
            username: "demo.cafe",
            biography: "Coffee and pastries in Central.",
            follower_count: 500,
            following_count: 20,
            media_count: 10,
            is_private: false,
            is_verified: false,
          },
        }), { status: 200 });
      }
      if (url.includes("get_ig_user_posts.php")) {
        return new Response(JSON.stringify({
          posts: [{
            id: "post-1",
            code: "POST_CODE",
            caption: "Fresh coffee",
            taken_at: 1_784_505_600,
            like_count: 5,
            comment_count: 1,
          }],
        }), { status: 200 });
      }
      if (url.includes("get_ig_user_reels.php")) {
        return new Response(JSON.stringify({ reels: [] }), { status: 200 });
      }
      if (url.includes("get_ig_user_highlights.php")) {
        return new Response(JSON.stringify({ highlights: [] }), { status: 200 });
      }
      if (url.includes("get_ig_user_stories.php")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      throw new Error("unexpected fetch: " + url);
    });
    vi.stubGlobal("fetch", fetcher);

    try {
      const confirmed = await collectScanProviders(
        { ...baseJob, ig_handle: "demo.cafe", website_url: null, ig_match_provenance: "picker_confirmed" as const },
        async () => undefined,
      );

      expect(confirmed.ig).toMatchObject({ status: "measured", confidence: "high" });

      // The same payload, hand-typed: match provenance is a CEILING on the
      // module's confidence, so an unverified handle can never present as
      // "high" however complete the profile is.
      const handTyped = await collectScanProviders(
        { ...baseJob, ig_handle: "demo.cafe", website_url: null, ig_match_provenance: "manual_typed" as const },
        async () => undefined,
      );

      expect(handTyped.ig).toMatchObject({ status: "measured", confidence: "medium" });
    } finally {
      vi.unstubAllGlobals();
      delete process.env.RAPIDAPI_INSTAGRAM_KEY;
    }
  });

  it("always populates trust, so the processor's trust branch runs in production", async () => {
    // The bug this guards: collection.trust was assigned in exactly one place in
    // the whole repo — a test fixture — so processor.ts's `if (collection.trust)`
    // never executed in production and the scorer's hardcoded "medium" reached
    // every report. Both other trust tests build a collection by hand, so they
    // pass even if collectScanProviders stops returning the field.
    delete process.env.RAPIDAPI_INSTAGRAM_KEY;
    delete process.env.GOOGLE_PLACES_KEY;
    vi.stubEnv("SERPAPI_KEY", "");
    vi.stubEnv("SERPAPI_API_KEY", "");

    const fetcher = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetcher);

    try {
      const result = await collectScanProviders(
        { ...baseJob, ig_handle: null, website_url: null },
        async () => undefined,
      );

      expect(result.trust).toBeDefined();
      expect(result.trust).toMatchObject({
        status: "unavailable",
        limitationCode: "TRUST_NOT_MEASURED",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("grades aeo confidence high when the website is reachable and at least three runs are usable", async () => {
    delete process.env.RAPIDAPI_INSTAGRAM_KEY;
    delete process.env.GOOGLE_PLACES_KEY;
    vi.stubEnv("SERPAPI_KEY", "");
    vi.stubEnv("SERPAPI_API_KEY", "test-serp-key");

    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://serpapi.com/")) {
        return new Response(JSON.stringify({
          search_metadata: { status: "Success", id: "search-id", total_time_taken: 1.0 },
          organic_results: [],
        }), { status: 200 });
      }
      if (url.includes("example.com")) {
        return new Response(
          "<html><head><meta name=\"description\" content=\"Demo\"></head><body><h1>Demo</h1></body></html>",
          { status: 200 },
        );
      }
      throw new Error("unexpected fetch: " + url);
    });
    vi.stubGlobal("fetch", fetcher);

    try {
      const result = await collectScanProviders(
        { ...baseJob, ig_handle: null, website_url: "https://example.com" },
        async () => undefined,
      );

      expect(result.aeo).toMatchObject({ status: "measured", confidence: "high" });
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});

describe("collectScanProviders when the merchant supplied no Instagram handle", () => {
  // Production 2026-08-15, report zmE9XgjppfKUUBamtp3Kl0J9: a merchant with no
  // Instagram handle produced three RapidAPI calls that the provider rejected
  // with "username_or_url is required", then IG_PROVIDER_FAILED (a retryable
  // failure, implying our system broke) and TRUST_NOT_MEASURED downstream.
  //
  // Nothing was broken and nothing is retryable: the merchant simply has no
  // Instagram. Spending three billed requests to be told so is the bug.
  const baseJob = {
    id: "00000000-0000-4000-8000-000000000002",
    business_name: "Teppanyaki Demo",
    ig_match_provenance: null,
    industry: null,
    district: null,
    region: "hk",
    merchant_evidence: {
      placeId: null,
      dataId: null,
      dataCid: null,
      mapsUrl: null,
      address: null,
      alternateNames: [],
    },
  };

  it("never calls the Instagram provider and reports an honest non-failure", async () => {
    process.env.RAPIDAPI_INSTAGRAM_KEY = "configured-key";
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("instagram-scraper-stable-api")) {
        return new Response(JSON.stringify({ message: "username_or_url is required" }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);

    try {
      const result = await collectScanProviders(
        { ...baseJob, ig_handle: null, website_url: null },
        async () => undefined,
      );

      const instagramCalls = fetcher.mock.calls.filter(([input]) =>
        String(input).includes("instagram-scraper-stable-api"));
      expect(instagramCalls, "must not spend RapidAPI requests with an empty username").toHaveLength(0);

      expect(result.ig.status).not.toBe("failed");
      expect(result.ig).toMatchObject({ status: "unavailable", limitationCode: "IG_HANDLE_NOT_PROVIDED" });
    } finally {
      vi.unstubAllGlobals();
      delete process.env.RAPIDAPI_INSTAGRAM_KEY;
    }
  });

  it("treats a whitespace-only handle the same as none", async () => {
    process.env.RAPIDAPI_INSTAGRAM_KEY = "configured-key";
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    try {
      const result = await collectScanProviders(
        { ...baseJob, ig_handle: "   ", website_url: null },
        async () => undefined,
      );
      const instagramCalls = fetcher.mock.calls.filter(([input]) =>
        String(input).includes("instagram-scraper-stable-api"));
      expect(instagramCalls).toHaveLength(0);
      expect(result.ig).toMatchObject({ status: "unavailable", limitationCode: "IG_HANDLE_NOT_PROVIDED" });
    } finally {
      vi.unstubAllGlobals();
      delete process.env.RAPIDAPI_INSTAGRAM_KEY;
    }
  });
});
