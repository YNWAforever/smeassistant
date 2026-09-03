import { describe, expect, it, vi } from "vitest";
import {
  createScanProcessor,
  providerData,
  type ClaimedScanJob,
  type ScanPersistence,
  type ScanProviderCollection,
  type ScanStage,
} from "@sme-scanner/scan-engine";
import { scoreAll, type AEOPayload, type GBPPayload, type IGPayload } from "@sme-scanner/scoring";
import {
  SCAN_FIXTURE_NAMES,
  createFixtureCollector,
  loadScanFixture,
  parseScanFixture,
  resolveFixtureName,
  shiftTimestamps,
  type ScanFixtureName,
} from "./fixtures";

const NOW = new Date("2027-03-15T09:30:00.000Z");

function job(overrides: Partial<ClaimedScanJob> = {}): ClaimedScanJob {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    business_name: "錦汶館",
    ig_handle: "kammanhouse.hk",
    ig_match_provenance: "picker_confirmed",
    website_url: "https://kammanhouse.example.invalid",
    industry: "餐飲",
    district: "天后",
    region: "hk",
    merchant_evidence: { placeId: null, dataId: null, dataCid: null, mapsUrl: null, address: null, alternateNames: [] },
    ...overrides,
  };
}

async function collect(name: ScanFixtureName, stages: ScanStage[] = []): Promise<ScanProviderCollection> {
  const collector = createFixtureCollector(name, { now: () => NOW });
  return collector(job(), async (stage) => {
    stages.push(stage);
  });
}

function score(collection: ScanProviderCollection) {
  return scoreAll({
    business_name: "錦汶館",
    industry: "餐飲",
    district: "天后",
    ig: providerData(collection.ig) ?? ({ available: false } as IGPayload),
    gbp: providerData(collection.gbp) ?? ({ available: false } as GBPPayload),
    aeo: providerData(collection.aeo) ?? ({ available: false, serpapi_runs: [] } as AEOPayload),
  });
}

describe("scan fixtures", () => {
  it.each(SCAN_FIXTURE_NAMES)("%s parses and declares its own name", (name) => {
    const fixture = loadScanFixture(name);
    expect(fixture.name).toBe(name);
    expect(fixture.market).toBe(name === "tw-cafe" ? "tw" : "hk");
    expect(Number.isFinite(Date.parse(fixture.collectedAt))).toBe(true);
  });

  it.each(["kam-man-house", "tw-cafe"] as const)("%s measures every module and scores an overall", async (name) => {
    const collection = await collect(name);

    expect(collection.ig.status).toBe("measured");
    expect(collection.gbp.status).toBe("measured");
    expect(collection.aeo.status).toBe("measured");
    expect(collection.trust?.status).toBe("measured");
    expect(collection.evidence).toEqual([]);

    const result = score(collection);
    expect(result.overall).not.toBeNull();
    expect(result.coverage).toBeCloseTo(1, 5);
    for (const key of ["ig", "gbp", "aeo", "trust"] as const) {
      expect(result.modules[key].status).toBe("measured");
      expect(result.modules[key].score).not.toBeNull();
    }
  });

  it("unavailable-ig reports IG_HANDLE_NOT_PROVIDED with gbp and aeo measured, and a coverage penalty instead of a zero", async () => {
    const collection = await collect("unavailable-ig");

    expect(collection.ig).toEqual({ status: "unavailable", limitationCode: "IG_HANDLE_NOT_PROVIDED" });
    expect(collection.gbp.status).toBe("measured");
    expect(collection.aeo.status).toBe("measured");
    expect(collection.trust).toEqual({ status: "unavailable", limitationCode: "TRUST_NOT_MEASURED" });
    expect(collection.raw).not.toHaveProperty("ig");

    const result = score(collection);
    // Two independent channels measured: an overall exists, but coverage is the
    // gbp + aeo weight only (unavailable != zero, CLAUDE.md guardrail 2).
    expect(result.overall).not.toBeNull();
    expect(result.modules.ig.score).toBeNull();
    expect(result.modules.ig.status).toBe("unavailable");
    expect(result.modules.trust.score).toBeNull();
    expect(result.coverage).toBeCloseTo(0.6, 5);
  });

  it("walks the same stages as the live collector", async () => {
    const stages: ScanStage[] = [];
    await collect("kam-man-house", stages);
    expect(stages).toEqual(["collecting_ig_gbp", "collecting_aeo"]);
  });

  it("is deterministic for a fixed clock and stamps that clock as collectedAt", async () => {
    const first = await collect("kam-man-house");
    const second = await collect("kam-man-house");
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    if (first.ig.status !== "measured") throw new Error("expected measured ig");
    expect(first.ig.collectedAt).toBe(NOW.toISOString());
  });

  it("keeps 'days since last post' constant by shifting fixture timestamps to the scan clock", async () => {
    const fixture = loadScanFixture("kam-man-house");
    if (fixture.ig.status !== "measured") throw new Error("expected measured ig");
    const anchoredLatest = Math.max(...fixture.ig.data.posts_last_12!.map((post) => Date.parse(post.posted_at!)));
    const expectedAge = Date.parse(fixture.collectedAt) - anchoredLatest;

    const collection = await collect("kam-man-house");
    const ig = providerData(collection.ig)!;
    const shiftedLatest = Math.max(...ig.posts_last_12!.map((post) => Date.parse(post.posted_at!)));

    expect(NOW.getTime() - shiftedLatest).toBe(expectedAge);
    expect(shiftedLatest).toBeLessThan(NOW.getTime());
    // The raw payload the proof panels read moves with it.
    const raw = collection.raw as { gbp: { reviews: Array<{ time: string }> } };
    expect(Date.parse(raw.gbp.reviews[0]!.time)).toBeLessThan(NOW.getTime());
    expect(Date.parse(raw.gbp.reviews[0]!.time)).toBeGreaterThan(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
  });

  it("selects a fixture by job when none is named", () => {
    expect(resolveFixtureName({ region: "tw", ig_handle: "x" })).toBe("tw-cafe");
    expect(resolveFixtureName({ region: "hk", ig_handle: null })).toBe("unavailable-ig");
    expect(resolveFixtureName({ region: "hk", ig_handle: "  " })).toBe("unavailable-ig");
    expect(resolveFixtureName({ region: "hk", ig_handle: "kammanhouse.hk" })).toBe("kam-man-house");
    expect(resolveFixtureName({ region: null, ig_handle: "kammanhouse.hk" })).toBe("kam-man-house");
  });

  it("uses the job to pick the fixture when the collector is unnamed", async () => {
    const collector = createFixtureCollector(undefined, { now: () => NOW });
    const noStage = async () => undefined;

    const tw = await collector(job({ region: "tw" }), noStage);
    expect(providerData(tw.gbp)?.name).toContain("山嵐咖啡");

    const igLess = await collector(job({ ig_handle: null }), noStage);
    expect(igLess.ig).toEqual({ status: "unavailable", limitationCode: "IG_HANDLE_NOT_PROVIDED" });
  });

  it("rejects malformed fixtures loudly", () => {
    expect(() => parseScanFixture(null)).toThrow(/scan_fixture_invalid/);
    expect(() => parseScanFixture({ name: "nope" })).toThrow(/name must be one of/);
    expect(() => parseScanFixture({ name: "tw-cafe", market: "us" })).toThrow(/market/);
    expect(() =>
      parseScanFixture({ name: "tw-cafe", market: "tw", collectedAt: "2026-09-01T02:00:00.000Z", raw: {}, ig: { status: "measured", confidence: "high", data: { available: false } }, gbp: {}, aeo: {} }),
    ).toThrow(/ig\.data/);
    expect(() =>
      parseScanFixture({ name: "tw-cafe", market: "tw", collectedAt: "2026-09-01T02:00:00.000Z", raw: {}, ig: { status: "unavailable" }, gbp: {}, aeo: {} }),
    ).toThrow(/ig\.limitationCode/);
  });

  it("shiftTimestamps only touches full ISO timestamps", () => {
    const shifted = shiftTimestamps(
      { at: "2026-09-01T02:00:00.000Z", query: "2026 best cafe", nested: [{ at: "2026-08-31T00:00:00Z" }], n: 3, b: null },
      24 * 60 * 60 * 1000,
    );
    expect(shifted).toEqual({
      at: "2026-09-02T02:00:00.000Z",
      query: "2026 best cafe",
      nested: [{ at: "2026-09-01T00:00:00.000Z" }],
      n: 3,
      b: null,
    });
  });
});

describe("fixtures through upstream's scan processor", () => {
  function run(name: ScanFixtureName, claimed: ClaimedScanJob) {
    const persisted: ScanPersistence[] = [];
    const stages: ScanStage[] = [];
    const processor = createScanProcessor({
      claimJob: async () => claimed,
      collect: createFixtureCollector(name, { now: () => NOW }),
      score: scoreAll,
      persist: async (result) => {
        persisted.push(result);
      },
      fail: vi.fn(async () => true),
      setStage: async (_jobId, stage) => {
        stages.push(stage);
      },
    });
    return { processor, persisted, stages };
  }

  it("reaches done for a fully measured fixture", async () => {
    const { processor, persisted, stages } = run("kam-man-house", job());
    await expect(processor(job().id)).resolves.toEqual({ status: "done" });
    expect(persisted[0]?.status).toBe("done");
    expect(persisted[0]?.overall).not.toBeNull();
    expect(persisted[0]?.moduleResults.ig.evidenceCollectedAt).toBe(NOW.toISOString());
    expect(persisted[0]?.moduleResults.ig.confidence).toBe("high");
    expect(stages).toEqual(["collecting", "collecting_ig_gbp", "collecting_aeo", "scoring", "persisting"]);
  });

  it("reaches partial for the IG-less fixture without touching RapidAPI", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const { processor, persisted } = run("unavailable-ig", job({ ig_handle: null }));
      await expect(processor(job().id)).resolves.toEqual({ status: "partial" });
      expect(persisted[0]?.moduleResults.ig).toMatchObject({ status: "unavailable", score: null, limitationCode: "IG_HANDLE_NOT_PROVIDED" });
      expect(persisted[0]?.coverage).toBeCloseTo(0.6, 5);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
