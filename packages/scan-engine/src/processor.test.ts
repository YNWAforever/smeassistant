import { describe, expect, it, vi } from "vitest";
import { scoreAll } from "@sme-scanner/scoring";
import type { AuditPayload } from "@sme-scanner/scoring";
import type { EvidenceCandidate } from "@sme-scanner/contracts";
import { createScanProcessor, normalizeModuleResults } from "./processor";
import type { ScanProviderCollection } from "./processor";

const job = {
  id: "job-1",
  business_name: "Demo Coffee",
  ig_handle: "demo.coffee",
  website_url: "https://example.com",
  industry: "Cafe",
  district: "Central",
  region: "hk",
};

const measuredIg = {
  status: "measured" as const,
  confidence: "medium" as const,
  collectedAt: "2026-07-14T00:00:00.000Z",
  data: {
    available: true,
    username: "demo.coffee",
    bio: "Coffee and pastries in Central. Visit us today.",
    followers: 100,
    following: 10,
    posts_count: 12,
    external_url: "https://example.com",
    posts_last_12: [
      {
        id: "post-1",
        caption: "Fresh coffee",
        media_type: "GraphImage",
        like_count: 12,
        comment_count: 2,
        posted_at: "2026-07-13T00:00:00.000Z",
      },
    ],
    reels_count: 1,
    highlights_count: 1,
    stories_count: 0,
  },
};

const measuredAeo = {
  status: "measured" as const,
  confidence: "medium" as const,
  collectedAt: "2026-07-14T00:00:00.000Z",
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
    website: {
      available: true,
      has_faq_schema: true,
      meta_description_len: 120,
      h1_count: 1,
    },
  },
};

const measuredGbp = {
  status: "measured" as const,
  confidence: "medium" as const,
  collectedAt: "2026-07-14T00:00:00.000Z",
  data: {
    available: true,
    place_id: "place-1",
    name: "Demo Coffee",
    rating: 4.7,
    reviews_count: 42,
    reviews: [{ rating: 5, text: "Great coffee", time: "2026-07-13T00:00:00.000Z", owner_response: "Thank you" }],
    photos_count: 10,
    hours_complete: true,
    categories: ["cafe"],
    recent_posts_count: 2,
  },
};
describe("createScanProcessor", () => {
  it("preserves confirmed merchant evidence from the claimed audit job", async () => {
    const processorModule = await import("./processor");
    const parser = (processorModule as unknown as {
      asClaimedJob?: (value: unknown) => unknown;
    }).asClaimedJob;

    expect(typeof parser).toBe("function");
    expect(parser?.({
      id: "job-1",
      business_name: "Kam Man Kitchen",
      place_id: "ChIJEffVtbwBBDQRjC76lkC6mKE",
      input_snapshot: {
        placeId: "ChIJEffVtbwBBDQRjC76lkC6mKE",
        dataId: "0x340401bcb5d5f711:0xa198ba4096fa2e8c",
        dataCid: "11644261623140069004",
        mapsUrl: "https://www.google.com/maps/place/?q=place_id:ChIJEffVtbwBBDQRjC76lkC6mKE",
        address: "35 Yik Yam Street, Happy Valley",
        alternateNames: ["?遛撱"],
      },
    })).toMatchObject({
      merchant_evidence: {
        placeId: "ChIJEffVtbwBBDQRjC76lkC6mKE",
        dataId: "0x340401bcb5d5f711:0xa198ba4096fa2e8c",
        dataCid: "11644261623140069004",
        mapsUrl: "https://www.google.com/maps/place/?q=place_id:ChIJEffVtbwBBDQRjC76lkC6mKE",
        address: "35 Yik Yam Street, Happy Valley",
        alternateNames: ["?遛撱"],
      },
    });
  });

  it("returns already_claimed without calling providers when the atomic claim is empty", async () => {
    const collect = vi.fn();
    const process = createScanProcessor({
      claimJob: vi.fn().mockResolvedValue(null),
      collect,
      score: scoreAll,
      persist: vi.fn(),
      fail: vi.fn(),
    });

    await expect(process("job-1")).resolves.toEqual({ status: "already_claimed" });
    expect(collect).not.toHaveBeenCalled();
  });

  it("persists a partial result and records the terminal transition once", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const recordTerminal = vi.fn().mockResolvedValue(undefined);
    const process = createScanProcessor({
      claimJob: vi.fn().mockResolvedValue(job),
      collect: vi.fn().mockResolvedValue({
        ig: measuredIg,
        gbp: { status: "failed", limitationCode: "GBP_PROVIDER_TIMEOUT", retryable: true },
        aeo: measuredAeo,
        trust: { status: "unavailable", limitationCode: "TRUST_NOT_MEASURED" },
      }),
      score: scoreAll,
      persist,
      fail: vi.fn(),
      recordTerminal,
    });

    await expect(process("job-1")).resolves.toEqual({ status: "partial" });
    expect(recordTerminal).toHaveBeenCalledTimes(1);
    expect(recordTerminal).toHaveBeenCalledWith({ jobId: "job-1", status: "partial", coverage: 0.55 });
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        status: "partial",
        coverage: 0.55,
        moduleResults: expect.objectContaining({
          gbp: expect.objectContaining({ status: "failed", score: null }),
        }),
      }),
    );
  });

  it("persists measured GBP and TRUST when SerpApi supplies scoreable GBP facts", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const process = createScanProcessor({
      claimJob: vi.fn().mockResolvedValue(job),
      collect: vi.fn().mockResolvedValue({
        ig: measuredIg,
        // This is the normalized ProviderResult emitted after the SerpApi GBP fallback.
        gbp: measuredGbp,
        aeo: measuredAeo,
      }),
      score: scoreAll,
      persist,
      fail: vi.fn(),
    });

    await expect(process("job-1")).resolves.toEqual({ status: "done" });

    const saved = persist.mock.calls[0]?.[0];
    expect(saved.moduleResults.gbp).toMatchObject({
      status: "measured",
      score: expect.any(Number),
      limitationCode: null,
    });
    expect(saved.moduleResults.trust).toMatchObject({
      status: "measured",
      score: expect.any(Number),
      limitationCode: null,
    });
  });
  it("keeps a measured scan complete when optional evidence persistence fails", async () => {
    const evidence: EvidenceCandidate[] = [{
      provider: "instagram",
      evidenceType: "post",
      sourceId: "post-1",
      sourceUrl: "https://www.instagram.com/p/code/",
      mediaUrl: "https://images.example/post.jpg",
      capturedAt: "2026-07-21T00:00:00.000Z",
      publishedAt: "2026-07-20T00:00:00.000Z",
      text: "Post",
      metadata: { likes: 5 },
      retention: "snapshot_permitted",
    }];
    const persistEvidence = vi.fn().mockRejectedValue(new Error("secret storage response"));
    const persist = vi.fn().mockResolvedValue(undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const process = createScanProcessor({
      claimJob: vi.fn().mockResolvedValue(job),
      collect: vi.fn().mockResolvedValue({
        ig: measuredIg,
        gbp: measuredGbp,
        aeo: measuredAeo,
        evidence,
      }),
      score: scoreAll,
      persist,
      persistEvidence,
      fail: vi.fn().mockResolvedValue(true),
    });

    await expect(process("job-1")).resolves.toEqual({ status: "done" });
    expect(persistEvidence).toHaveBeenCalledWith("job-1", evidence);
    expect(persist.mock.invocationCallOrder[0])
      .toBeLessThan(persistEvidence.mock.invocationCallOrder[0]!);
    expect(error).toHaveBeenCalledWith(
      "[scan/process] optional evidence persistence failed",
      { jobId: "job-1", category: "evidence_persistence_failed", candidateCount: 1 },
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("secret storage response");
  });

  it("never starts optional evidence persistence before the score result is durable", async () => {
    const evidence: EvidenceCandidate[] = [{
      provider: "instagram",
      evidenceType: "profile",
      sourceId: "demo.coffee",
      sourceUrl: "https://www.instagram.com/demo.coffee/",
      mediaUrl: null,
      capturedAt: "2026-07-21T00:00:00.000Z",
      publishedAt: null,
      text: null,
      metadata: {},
      retention: "metadata_only",
    }];
    const persistEvidence = vi.fn().mockResolvedValue(undefined);
    const process = createScanProcessor({
      claimJob: vi.fn().mockResolvedValue(job),
      collect: vi.fn().mockResolvedValue({
        ig: measuredIg,
        gbp: measuredGbp,
        aeo: measuredAeo,
        evidence,
      }),
      score: scoreAll,
      persist: vi.fn().mockRejectedValue(new Error("persist_job_failed")),
      persistEvidence,
      fail: vi.fn().mockResolvedValue(true),
    });

    await expect(process("job-1")).resolves.toMatchObject({
      status: "failed",
      failurePersistence: "persisted",
    });
    expect(persistEvidence).not.toHaveBeenCalled();
  });

  it("does not call providers twice when the processor is invoked after a claim", async () => {
    const collect = vi.fn().mockResolvedValue({
      ig: measuredIg,
      gbp: measuredGbp,
      aeo: measuredAeo,
    });
    const claimJob = vi
      .fn()
      .mockResolvedValueOnce(job)
      .mockResolvedValueOnce(null);
    const process = createScanProcessor({
      claimJob,
      collect,
      score: (payload: AuditPayload) => scoreAll(payload),
      persist: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn(),
    });

    await process("job-1");
    await process("job-1");

    expect(claimJob).toHaveBeenCalledTimes(2);
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it("does not call the failure transition when this worker loses the claim", async () => {
    const fail = vi.fn().mockResolvedValue(true);
    const process = createScanProcessor({
      claimJob: vi.fn().mockResolvedValue(null),
      collect: vi.fn(),
      score: scoreAll,
      persist: vi.fn(),
      fail,
    });

    await expect(process("job-1")).resolves.toEqual({ status: "already_claimed" });
    expect(fail).not.toHaveBeenCalled();
  });

  it("does not expose a correlation id when failure persistence fails", async () => {
    const fail = vi.fn().mockResolvedValue(false);
    const process = createScanProcessor({
      claimJob: vi.fn().mockResolvedValue(job),
      collect: vi.fn().mockRejectedValue(new Error("provider secret response")),
      score: scoreAll,
      persist: vi.fn(),
      fail,
    });

    await expect(process("job-1")).resolves.toEqual({
      status: "failed",
      failurePersistence: "not_persisted",
    });
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({
      category: "COLLECTION_FAILED",
      correlationId: expect.any(String),
    }));
  });

  it("records real processing stages and redacts provider errors before persistence", async () => {
    const stages: string[] = [];
    let persisted: unknown;
    const process = createScanProcessor({
      claimJob: vi.fn().mockResolvedValue(job),
      collect: vi.fn().mockResolvedValue({
        ig: measuredIg,
        gbp: measuredGbp,
        aeo: measuredAeo,
        raw: {
          aeo: {
            serpapi_runs: [],
            website: null,
            merchant_performance: {
              runs: [{ serpapi: { status: "Error", error: "provider secret" } }],
            },
          },
        } as never,
      }),
      score: scoreAll,
      persist: vi.fn().mockImplementation(async (result) => { persisted = result; }),
      fail: vi.fn().mockResolvedValue(true),
      setStage: vi.fn().mockImplementation(async (_jobId, stage) => { stages.push(stage); }),
    });

    await expect(process("job-1")).resolves.toEqual({ status: "done" });
    expect(stages).toEqual(["collecting", "scoring", "persisting"]);
    expect(JSON.stringify(persisted)).not.toContain("provider secret");
  });

  it("does not invoke a duplicate provider collection after another worker claims the job", async () => {
    const collect = vi.fn().mockResolvedValue({ ig: measuredIg, gbp: measuredGbp, aeo: measuredAeo });
    const process = createScanProcessor({
      claimJob: vi.fn().mockResolvedValueOnce(job).mockResolvedValueOnce(null),
      collect,
      score: scoreAll,
      persist: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(true),
    });

    const first = process("job-1");
    const second = process("job-1");
    await expect(second).resolves.toEqual({ status: "already_claimed" });
    await expect(first).resolves.toEqual({ status: "done" });
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it("records a persisted failed terminal transition once", async () => {
    const recordTerminal = vi.fn().mockResolvedValue(undefined);
    const process = createScanProcessor({
      claimJob: vi.fn().mockResolvedValue(job),
      collect: vi.fn().mockRejectedValue(new Error("provider unavailable")),
      score: scoreAll,
      persist: vi.fn(),
      fail: vi.fn().mockResolvedValue(true),
      recordTerminal,
    });

    await expect(process("job-1")).resolves.toEqual({
      status: "failed",
      correlationId: expect.any(String),
      failurePersistence: "persisted",
    });
    expect(recordTerminal).toHaveBeenCalledTimes(1);
    expect(recordTerminal).toHaveBeenCalledWith({ jobId: "job-1", status: "failed", coverage: 0 });
  });
  it("returns the persisted terminal state when analytics never settles", async () => {
    const process = createScanProcessor({
      claimJob: vi.fn().mockResolvedValue(job),
      collect: vi.fn().mockResolvedValue({ ig: measuredIg, gbp: measuredGbp, aeo: measuredAeo }),
      score: scoreAll,
      persist: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(true),
      recordTerminal: vi.fn(() => new Promise<void>(() => {})),
    });

    const result = await Promise.race([
      process("job-1"),
      new Promise<"test_timeout">((resolve) => setTimeout(() => resolve("test_timeout"), 100)),
    ]);

    expect(result).toEqual({ status: "done" });
  });
});

describe("normalizeModuleResults", () => {
  const auditPayload: AuditPayload = {
    business_name: job.business_name,
    industry: job.industry,
    district: job.district,
    ig: measuredIg.data,
    gbp: measuredGbp.data,
    aeo: measuredAeo.data,
  };
  const scored = scoreAll(auditPayload);

  function collectionWithConfidence(confidence: "low" | "high"): ScanProviderCollection {
    return {
      ig: { ...measuredIg, confidence },
      gbp: { ...measuredGbp, confidence },
      aeo: { ...measuredAeo, confidence },
      trust: { status: "measured", data: null, confidence, collectedAt: "2026-07-14T00:00:00.000Z" },
    };
  }

  // Guard, not a red-first test: it pins a property normalizeModuleResults
  // already has (score comes only from the scorer's payload, never from
  // confidence). Score comparability has already reset twice in six days —
  // this exists so a future change that lets confidence leak into score
  // fails loudly instead of silently re-breaking comparability.
  it("scores identically regardless of confidence, while confidence itself differs", () => {
    const low = normalizeModuleResults(scored, collectionWithConfidence("low"));
    const high = normalizeModuleResults(scored, collectionWithConfidence("high"));

    for (const key of ["ig", "gbp", "aeo", "trust"] as const) {
      expect(low[key].score).toBe(high[key].score);
      expect(low[key].confidence).toBe("low");
      expect(high[key].confidence).toBe("high");
    }
  });

  it("carries the collection's trust confidence onto the normalized trust module", () => {
    const collection: ScanProviderCollection = {
      ig: measuredIg,
      gbp: measuredGbp,
      aeo: measuredAeo,
      trust: { status: "measured", data: null, confidence: "low", collectedAt: "2026-07-14T00:00:00.000Z" },
    };

    const normalized = normalizeModuleResults(scored, collection);

    // scoreTrust itself always returns the flat "medium" — this proves the
    // collection's real confidence overrides that default, guarding the
    // processor.ts branch that, before this phase, no code path ever
    // populated collection.trust to exercise.
    expect(normalized.trust.confidence).toBe("low");
  });
});
describe("asClaimedJob instagram provenance", () => {
  async function parseJob(value: unknown): Promise<{ ig_match_provenance: unknown } | null> {
    const processorModule = await import("./processor");
    const parser = (processorModule as unknown as {
      asClaimedJob?: (input: unknown) => { ig_match_provenance: unknown } | null;
    }).asClaimedJob;
    return parser ? parser(value) : null;
  }

  it("reads a valid provenance out of the input snapshot", async () => {
    const job = await parseJob({
      id: "job-1",
      business_name: "金萬餐廳",
      input_snapshot: { instagramMatchProvenance: "picker_confirmed" },
    });
    expect(job?.ig_match_provenance).toBe("picker_confirmed");
  });

  it("returns null for a missing or unrecognized provenance", async () => {
    const missing = await parseJob({ id: "job-1", business_name: "金萬餐廳" });
    expect(missing?.ig_match_provenance).toBeNull();

    const unknown = await parseJob({
      id: "job-1",
      business_name: "金萬餐廳",
      input_snapshot: { instagramMatchProvenance: "oauth_verified" },
    });
    expect(unknown?.ig_match_provenance).toBeNull();
  });
});
