import { describe, expect, it } from "vitest";
import { buildAeoTrendModel, type AeoSnapshotRow } from "./aeo-trend-model";

describe("buildAeoTrendModel", () => {
  it("computes presence rate per surface per scan, ordered oldest to newest", () => {
    const rows: AeoSnapshotRow[] = [
      { job_id: "job-1", surface: "organic", cited: true, captured_at: "2026-06-01T00:00:00Z" },
      { job_id: "job-1", surface: "organic", cited: false, captured_at: "2026-06-01T00:00:01Z" },
      { job_id: "job-2", surface: "organic", cited: true, captured_at: "2026-07-01T00:00:00Z" },
      { job_id: "job-2", surface: "organic", cited: true, captured_at: "2026-07-01T00:00:01Z" },
    ];

    const model = buildAeoTrendModel(rows);
    const organic = model.surfaces.find((s) => s.surface === "organic")!;

    expect(organic.points).toEqual([
      { capturedAt: "2026-06-01T00:00:00Z", presenceRate: 0.5 },
      { capturedAt: "2026-07-01T00:00:00Z", presenceRate: 1 },
    ]);
  });

  it("omits a surface entirely from a scan that never tracked it, rather than a false zero", () => {
    const rows: AeoSnapshotRow[] = [
      { job_id: "job-1", surface: "organic", cited: true, captured_at: "2026-06-01T00:00:00Z" },
      // job-1 has no ai_mode rows at all -- e.g. no query hit the ai_mode engine that scan.
      { job_id: "job-2", surface: "ai_mode", cited: false, captured_at: "2026-07-01T00:00:00Z" },
    ];

    const model = buildAeoTrendModel(rows);
    const aiMode = model.surfaces.find((s) => s.surface === "ai_mode")!;

    expect(aiMode.points).toEqual([{ capturedAt: "2026-07-01T00:00:00Z", presenceRate: 0 }]);
  });

  it("caps each surface's series to the last 12 scan-points", () => {
    const rows: AeoSnapshotRow[] = Array.from({ length: 15 }, (_, i) => ({
      job_id: `job-${i}`,
      surface: "organic" as const,
      cited: true,
      captured_at: new Date(2026, 0, i + 1).toISOString(),
    }));

    const model = buildAeoTrendModel(rows);
    const organic = model.surfaces.find((s) => s.surface === "organic")!;

    expect(organic.points).toHaveLength(12);
    // Keeps the most recent 12, not the first 12.
    expect(organic.points[0]!.capturedAt).toBe(new Date(2026, 0, 4).toISOString());
    expect(organic.points[11]!.capturedAt).toBe(new Date(2026, 0, 15).toISOString());
  });

  it("returns an empty model for zero input rows, for all three surfaces", () => {
    const model = buildAeoTrendModel([]);
    expect(model.surfaces).toEqual([
      { surface: "ai_overview", points: [] },
      { surface: "ai_mode", points: [] },
      { surface: "organic", points: [] },
    ]);
  });
});
