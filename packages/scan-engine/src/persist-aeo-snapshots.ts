import type { RawData } from "@sme-scanner/contracts";

/** Bounded per this repo's evidence-retention discipline: never persist full model text. */
const EXCERPT_MAX_LENGTH = 280;

function truncate(text: string): string {
  return text.length > EXCERPT_MAX_LENGTH ? `${text.slice(0, EXCERPT_MAX_LENGTH)}…` : text;
}

export type AeoSurfaceRowKind = "ai_overview" | "ai_mode" | "organic";

export interface AeoSnapshotInsertRow {
  job_id: string;
  place_id: string;
  surface: AeoSurfaceRowKind;
  query_text: string;
  locale: string;
  market: string;
  cited: boolean;
  rank: number | null;
  competitors: string[];
  excerpt: string | null;
}

/**
 * Derives snapshot rows from the shape already persisted to
 * audit_jobs.raw_data.aeo.serpapi_runs. A "google"-engine run always yields
 * an organic row (the run IS the organic-eligible attempt) plus an
 * ai_overview row (cited: false when no AI Overview block appeared — a real,
 * trend-worthy signal, not an unmeasured gap, because the run itself
 * succeeded). A "google_ai_mode"-engine run yields only an ai_mode row —
 * including when its `ai_mode` field is null, i.e. SerpApi succeeded but the
 * model produced no markdown answer for that query (cited: false in that
 * case, not a dropped run). The branch is keyed on `engine`, not on
 * `ai_mode !== null`: a successful-but-empty AI Mode response has
 * `ai_mode: null` too, so that field alone can't tell the two engines apart.
 * `available === false` (a provider error) yields nothing: unmeasured must
 * never be recorded as measured-and-absent.
 */
export function deriveAeoSnapshotRows(
  runs: NonNullable<RawData["aeo"]>["serpapi_runs"],
  ctx: { jobId: string; placeId: string; locale: string; market: string },
): AeoSnapshotInsertRow[] {
  const rows: AeoSnapshotInsertRow[] = [];

  for (const run of runs) {
    if (run.available === false) continue;

    const base = {
      job_id: ctx.jobId,
      place_id: ctx.placeId,
      query_text: run.query,
      locale: ctx.locale,
      market: ctx.market,
      competitors: run.competitors_mentioned,
    };

    if (run.engine === "google_ai_mode") {
      rows.push({
        ...base,
        surface: "ai_mode",
        // ai_mode is null when SerpApi succeeded but the model produced no
        // markdown answer for this query -- a real, negative signal, not a
        // dropped run, so it still yields a row (cited: false).
        cited: run.ai_mode !== null && run.ai_mode.brand_mentioned,
        rank: null,
        excerpt: run.ai_mode ? truncate(run.ai_mode.text) : null,
      });
      continue;
    }

    rows.push({
      ...base,
      surface: "organic",
      cited: run.brand_organic_rank !== null,
      rank: run.brand_organic_rank,
      excerpt: null,
    });
    rows.push({
      ...base,
      surface: "ai_overview",
      cited: run.ai_overview !== null && run.ai_overview.brand_mentioned,
      rank: null,
      excerpt: run.ai_overview ? truncate(run.ai_overview.text) : null,
    });
  }

  return rows;
}

export interface PersistAeoSnapshotsDeps {
  loadJob: (jobId: string) => Promise<{
    place_id: string | null;
    raw_data: RawData | null;
    input_snapshot: Record<string, unknown> | null;
  } | null>;
  saveSnapshots: (rows: AeoSnapshotInsertRow[]) => Promise<void>;
}

export type PersistAeoSnapshotsResult =
  | { stored: number }
  | { stored: 0; reason: "no_job" | "no_place_id" | "no_aeo_data" };

function stringField(snapshot: Record<string, unknown> | null, key: string): string {
  const value = snapshot?.[key];
  return typeof value === "string" && value.length > 0 ? value : "unknown";
}

/**
 * Persists AI-visibility citation facts for one completed job. Called from
 * the scan execution pipeline as a non-critical-path step, alongside the
 * existing trend-diff step — see packages/scan-engine/src/execution.ts.
 */
export async function persistAeoSnapshots(
  jobId: string,
  deps: PersistAeoSnapshotsDeps,
): Promise<PersistAeoSnapshotsResult> {
  const job = await deps.loadJob(jobId);
  if (!job) return { stored: 0, reason: "no_job" };
  if (!job.place_id) return { stored: 0, reason: "no_place_id" };

  const runs = job.raw_data?.aeo?.serpapi_runs;
  if (!runs || runs.length === 0) return { stored: 0, reason: "no_aeo_data" };

  const rows = deriveAeoSnapshotRows(runs, {
    jobId,
    placeId: job.place_id,
    locale: stringField(job.input_snapshot, "locale"),
    market: stringField(job.input_snapshot, "market"),
  });
  if (rows.length === 0) return { stored: 0, reason: "no_aeo_data" };

  await deps.saveSnapshots(rows);
  return { stored: rows.length };
}
