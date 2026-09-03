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
}

export interface AeoSurfaceTrend {
  surface: AeoSurface;
  /** Ascending by capturedAt, capped to the most recent MAX_POINTS. */
  points: AeoTrendPoint[];
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
    for (const job of jobsAscending) {
      const stat = job.bySurface.get(surface);
      if (!stat || stat.total === 0) continue;
      points.push({ capturedAt: job.capturedAt, presenceRate: stat.cited / stat.total });
    }
    return { surface, points: points.slice(-MAX_POINTS) };
  });

  return { surfaces };
}
