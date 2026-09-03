import { describe, expect, it, vi } from "vitest";
import { persistScanDiff, type PersistDiffDeps } from "./persist-diff";

const MEASURED = {
  ig: { status: "measured", score: 60, findingKeys: ["IG_LOW_POST_FREQUENCY"] },
  gbp: { status: "measured", score: 70, findingKeys: [] },
  aeo: { status: "measured", score: 40, findingKeys: [] },
};

const BASE_CANDIDATE = { id: "job-old", status: "done", created_at: "2026-07-15T01:00:00.000Z" };

function deps(overrides: Partial<PersistDiffDeps> = {}): PersistDiffDeps & {
  saveDiff: ReturnType<typeof vi.fn>;
} {
  const saveDiff = vi.fn(async () => {});
  return {
    loadHead: vi.fn(async () => ({
      id: "job-new",
      place_id: "place-1",
      created_at: "2026-08-15T01:00:00.000Z",
      scoring_version: "2026-08-02",
      module_results: MEASURED as Record<string, unknown>,
    })),
    listCandidates: vi.fn(async () => [BASE_CANDIDATE]),
    loadJob: vi.fn(async () => ({
      scoring_version: "2026-08-02",
      module_results: MEASURED as Record<string, unknown>,
    })),
    saveDiff,
    ...overrides,
  } as PersistDiffDeps & { saveDiff: ReturnType<typeof vi.fn> };
}

describe("persistScanDiff", () => {
  it("does nothing when the head job cannot be read", async () => {
    const d = deps({ loadHead: vi.fn(async () => null) });
    expect(await persistScanDiff("job-new", d)).toEqual({ stored: false, reason: "no_head" });
    expect(d.saveDiff).not.toHaveBeenCalled();
  });

  it("does nothing for a manual-entry scan with no place_id", async () => {
    const d = deps({
      loadHead: vi.fn(async () => ({
        id: "job-new",
        place_id: null,
        created_at: "2026-08-15T01:00:00.000Z",
        scoring_version: "2026-08-02",
        module_results: MEASURED as Record<string, unknown>,
      })),
    });
    expect(await persistScanDiff("job-new", d)).toEqual({ stored: false, reason: "no_place_id" });
    expect(d.saveDiff).not.toHaveBeenCalled();
  });

  it("does nothing when the merchant has no earlier scan", async () => {
    const d = deps({ listCandidates: vi.fn(async () => []) });
    expect(await persistScanDiff("job-new", d)).toEqual({ stored: false, reason: "no_base" });
    expect(d.saveDiff).not.toHaveBeenCalled();
  });

  it("stores a comparable diff keyed on both job ids", async () => {
    const d = deps();
    expect(await persistScanDiff("job-new", d)).toEqual({ stored: true });

    const saved = d.saveDiff.mock.calls[0]![0];
    expect(saved).toMatchObject({
      base_job_id: "job-old",
      head_job_id: "job-new",
      comparable: true,
      incomparable_reason: null,
    });
    expect(saved.intersection_modules).toEqual(expect.arrayContaining(["ig", "gbp", "aeo"]));
  });

  it("stores an incomparable pair rather than dropping it", async () => {
    // The row is why the merchant sees no trend. Without it the UI cannot tell
    // "not compared yet" from "compared and it would have been unfair".
    const d = deps({
      loadJob: vi.fn(async () => ({
        scoring_version: "2026-05-01",
        module_results: MEASURED as Record<string, unknown>,
      })),
    });
    expect(await persistScanDiff("job-new", d)).toEqual({ stored: true });
    expect(d.saveDiff.mock.calls[0]![0]).toMatchObject({
      comparable: false,
      incomparable_reason: "SCORING_VERSION_MISMATCH",
      composite_base: null,
      composite_head: null,
      composite_delta: null,
    });
  });

  it("records a withheld composite without calling the pair incomparable", async () => {
    // One measured channel is a real comparison, but not enough to publish a
    // single number. Those are different failures and must not be conflated.
    const thin = { ig: { status: "measured", score: 60, findingKeys: [] } };
    const d = deps({
      loadHead: vi.fn(async () => ({
        id: "job-new",
        place_id: "place-1",
        created_at: "2026-08-15T01:00:00.000Z",
        scoring_version: "2026-08-02",
        module_results: thin as Record<string, unknown>,
      })),
      loadJob: vi.fn(async () => ({
        scoring_version: "2026-08-02",
        module_results: thin as Record<string, unknown>,
      })),
    });
    await persistScanDiff("job-new", d);

    expect(d.saveDiff.mock.calls[0]![0]).toMatchObject({
      comparable: true,
      composite_withheld_reason: "INSUFFICIENT_INDEPENDENT_CHANNELS",
      composite_delta: null,
    });
  });

  it("does nothing when the chosen base row cannot be read", async () => {
    const d = deps({ loadJob: vi.fn(async () => null) });
    expect(await persistScanDiff("job-new", d)).toEqual({ stored: false, reason: "no_base_row" });
    expect(d.saveDiff).not.toHaveBeenCalled();
  });

  it("looks for candidates by the head's place_id", async () => {
    const d = deps();
    await persistScanDiff("job-new", d);
    expect(d.listCandidates).toHaveBeenCalledWith("place-1");
  });
});
