export type AeoSurface = "ai_overview" | "ai_mode" | "organic";

/** The columns the dashboard query actually reads (see app/[locale]/owner/page.tsx). */
export interface AeoSnapshotRow {
  job_id: string;
  surface: AeoSurface;
  cited: boolean;
  captured_at: string;
}

export interface AeoTrendPoint {
  capturedAt: string;
  /** 0-1. The fraction of this scan's tracked queries for this surface that cited the brand. */
  presenceRate: number;
  /** The numerator, kept explicitly rather than recovered from a rounded percentage. */
  cited: number;
  /**
   * The denominator: rows persisted for this surface in this scan, i.e. probes
   * that returned a usable result -- NOT the number of queries planned. It
   * varies between scans (an ai_mode ambiguity retry adds a second probe), so
   * "0% -> 50%" can mean nothing changed except that a retry ran. The view has
   * to show it or the percentages are not comparable to each other.
   */
  total: number;
  /**
   * Scans between this point and the previous emitted one that measured nothing
   * for this surface. 0 means the two points are adjacent scans; anything more
   * is a gap the view must mark rather than draw across (CLAUDE.md 7).
   */
  skippedScans: number;
}

export interface AeoSurfaceTrend {
  surface: AeoSurface;
  /** Ascending by capturedAt, capped to the most recent MAX_POINTS. */
  points: AeoTrendPoint[];
  /** True when MAX_POINTS dropped older points, so the view can say so. */
  truncated: boolean;
}

export interface AeoTrendModel {
  /** Always exactly one entry per SURFACE_ORDER value, in that order. */
  surfaces: AeoSurfaceTrend[];
}

const SURFACE_ORDER: AeoSurface[] = ["ai_overview", "ai_mode", "organic"];
const MAX_POINTS = 12;

interface JobAggregate {
  capturedAt: string;
  bySurface: Map<AeoSurface, { cited: number; total: number }>;
}

/**
 * Groups rows into one point per (job, surface): presenceRate = cited / total
 * tracked queries. A surface a scan never tracked is omitted from that
 * surface's series for that scan entirely -- never rendered as a false 0%,
 * matching how normalizeModuleResults refuses to invent a measurement the
 * scan didn't take.
 */
export function buildAeoTrendModel(rows: AeoSnapshotRow[]): AeoTrendModel {
  const byJob = new Map<string, JobAggregate>();

  for (const row of rows) {
    let job = byJob.get(row.job_id);
    if (!job) {
      job = { capturedAt: row.captured_at, bySurface: new Map() };
      byJob.set(row.job_id, job);
    }
    const stat = job.bySurface.get(row.surface) ?? { cited: 0, total: 0 };
    stat.total += 1;
    if (row.cited) stat.cited += 1;
    job.bySurface.set(row.surface, stat);
  }

  const jobsAscending = [...byJob.values()].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
  );

  const surfaces: AeoSurfaceTrend[] = SURFACE_ORDER.map((surface) => {
    const points: AeoTrendPoint[] = [];
    // The skip stays -- a scan that measured nothing for this surface must not
    // be recorded as a measured zero (guardrail 2). What changes is that the
    // model stops DISCARDING the fact that it skipped: the view needs to mark
    // the gap instead of joining two non-adjacent scans with an arrow.
    let skipped = 0;
    for (const job of jobsAscending) {
      const stat = job.bySurface.get(surface);
      if (!stat || stat.total === 0) {
        skipped += 1;
        continue;
      }
      points.push({
        capturedAt: job.capturedAt,
        presenceRate: stat.cited / stat.total,
        cited: stat.cited,
        total: stat.total,
        skippedScans: skipped,
      });
      skipped = 0;
    }
    const capped = points.slice(-MAX_POINTS);
    return { surface, points: capped, truncated: capped.length < points.length };
  });

  return { surfaces };
}
