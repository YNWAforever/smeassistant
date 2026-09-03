import { describe, expect, it, vi } from "vitest";
import { persistAeoSnapshots, deriveAeoSnapshotRows } from "./persist-aeo-snapshots";
import type { RawData } from "@sme-scanner/contracts";

const RUNS_FIXTURE: NonNullable<RawData["aeo"]>["serpapi_runs"] = [
  {
    query: "咖啡店 中環",
    engine: "google",
    ai_overview: { text: "Demo Cafe is a well-reviewed coffee shop in Central.", brand_mentioned: true, sources: [] },
    ai_mode: null,
    organic_results: [{ title: "Demo Cafe", url: "https://demo.example.com", snippet: "", position: 1 }],
    brand_organic_rank: 1,
    competitors_mentioned: ["Rival Cafe"],
    available: true,
  },
  {
    query: "best coffee shop Central Hong Kong",
    engine: "google_ai_mode",
    ai_overview: null,
    ai_mode: { text: "Several cafes are popular in Central, including Rival Cafe.", brand_mentioned: false },
    organic_results: [],
    brand_organic_rank: null,
    competitors_mentioned: ["Rival Cafe"],
    available: true,
  },
  {
    // A provider error: available: false. Must produce zero rows.
    query: "cafe near me",
    engine: "google",
    ai_overview: null,
    ai_mode: null,
    organic_results: [],
    brand_organic_rank: null,
    competitors_mentioned: [],
    available: false,
  },
];

describe("deriveAeoSnapshotRows", () => {
  it("emits organic + ai_overview rows for a google-engine run, and an ai_mode row for an ai-mode run", () => {
    const rows = deriveAeoSnapshotRows(RUNS_FIXTURE, {
      jobId: "job-1",
      placeId: "place-1",
      locale: "zh-HK",
      market: "hk",
    });

    expect(rows).toHaveLength(3);

    const organic = rows.find((r) => r.surface === "organic");
    expect(organic).toMatchObject({
      job_id: "job-1", place_id: "place-1", query_text: "咖啡店 中環",
      locale: "zh-HK", market: "hk", cited: true, rank: 1, competitors: ["Rival Cafe"],
    });

    const aiOverview = rows.find((r) => r.surface === "ai_overview");
    expect(aiOverview).toMatchObject({ query_text: "咖啡店 中環", cited: true, rank: null });
    expect(aiOverview!.excerpt).toContain("Demo Cafe is a well-reviewed");

    const aiMode = rows.find((r) => r.surface === "ai_mode");
    expect(aiMode).toMatchObject({
      query_text: "best coffee shop Central Hong Kong", cited: false, rank: null, competitors: ["Rival Cafe"],
    });
  });

  it("emits only a not-cited ai_mode row for a successful-but-empty AI Mode response, never spurious organic/ai_overview rows", () => {
    // available: true (SerpApi succeeded) but ai_mode: null (the model produced
    // no markdown answer for this query) -- the exact shape an empty-but-
    // successful google_ai_mode run produces. Before the fix, this was
    // misclassified as a google-engine run and emitted spurious false-"not
    // cited" organic + ai_overview rows while silently dropping the real
    // (negative) ai_mode signal.
    const emptyAiModeRun = {
      query: "best coffee shop Central",
      engine: "google_ai_mode" as const,
      ai_overview: null,
      ai_mode: null,
      organic_results: [],
      brand_organic_rank: null,
      competitors_mentioned: [],
      available: true,
    };

    const rows = deriveAeoSnapshotRows([emptyAiModeRun], {
      jobId: "job-1", placeId: "place-1", locale: "en", market: "hk",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ surface: "ai_mode", cited: false, rank: null });
  });

  it("skips runs the provider marked unavailable", () => {
    const rows = deriveAeoSnapshotRows(
      [RUNS_FIXTURE[2]!],
      { jobId: "job-1", placeId: "place-1", locale: "zh-HK", market: "hk" },
    );
    expect(rows).toEqual([]);
  });

  it("truncates a long excerpt rather than storing full text", () => {
    const longText = "a".repeat(500);
    const rows = deriveAeoSnapshotRows(
      [{
        query: "q", engine: "google", ai_overview: { text: longText, brand_mentioned: true, sources: [] },
        ai_mode: null, organic_results: [], brand_organic_rank: null,
        competitors_mentioned: [], available: true,
      }],
      { jobId: "job-1", placeId: "place-1", locale: "en", market: "hk" },
    );
    const aiOverview = rows.find((r) => r.surface === "ai_overview")!;
    expect(aiOverview.excerpt!.length).toBeLessThan(500);
  });
});

describe("persistAeoSnapshots", () => {
  it("writes derived rows through saveSnapshots", async () => {
    const loadJob = vi.fn().mockResolvedValue({
      place_id: "place-1",
      raw_data: { aeo: { serpapi_runs: RUNS_FIXTURE } },
      input_snapshot: { locale: "zh-HK", market: "hk" },
    });
    const saveSnapshots = vi.fn().mockResolvedValue(undefined);

    const result = await persistAeoSnapshots("job-1", { loadJob, saveSnapshots });

    expect(result).toEqual({ stored: 3 });
    expect(saveSnapshots).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ job_id: "job-1", surface: "organic" })]),
    );
  });

  it("stores nothing when the job has no place_id", async () => {
    const loadJob = vi.fn().mockResolvedValue({ place_id: null, raw_data: { aeo: { serpapi_runs: RUNS_FIXTURE } }, input_snapshot: {} });
    const saveSnapshots = vi.fn();

    const result = await persistAeoSnapshots("job-1", { loadJob, saveSnapshots });

    expect(result).toEqual({ stored: 0, reason: "no_place_id" });
    expect(saveSnapshots).not.toHaveBeenCalled();
  });

  it("stores nothing when the job has no AEO data", async () => {
    const loadJob = vi.fn().mockResolvedValue({ place_id: "place-1", raw_data: {}, input_snapshot: {} });
    const saveSnapshots = vi.fn();

    const result = await persistAeoSnapshots("job-1", { loadJob, saveSnapshots });

    expect(result).toEqual({ stored: 0, reason: "no_aeo_data" });
    expect(saveSnapshots).not.toHaveBeenCalled();
  });

  it("falls back to 'unknown' locale/market when input_snapshot lacks them", async () => {
    const loadJob = vi.fn().mockResolvedValue({
      place_id: "place-1",
      raw_data: { aeo: { serpapi_runs: [RUNS_FIXTURE[0]] } },
      input_snapshot: {},
    });
    const saveSnapshots = vi.fn().mockResolvedValue(undefined);

    await persistAeoSnapshots("job-1", { loadJob, saveSnapshots });

    expect(saveSnapshots).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ locale: "unknown", market: "unknown" })]),
    );
  });
});
