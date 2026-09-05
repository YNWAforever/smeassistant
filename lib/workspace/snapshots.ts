import { completionId } from "@/lib/workspace/completion-id";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runWebsiteChecks, type WebsiteChecks } from "@/lib/website/checks";
import { deriveMetrics, type SnapshotMetrics } from "./metrics";
import { deriveModuleStates, type ModuleStates } from "./module-states";

export type { ModuleState, ModuleStateKey, ModuleStates, ProviderState } from "./module-states";
export type { MetricKey, SnapshotMetrics } from "./metrics";
export type { WebsiteChecks } from "@/lib/website/checks";

/**
 * Workspace snapshots (CLAUDE.md §3.5): one `scan_snapshots` row per finished
 * job that belongs to a workspace. It carries workspace *metrics* and module
 * states copied from the job — never a second score. Comparability is read
 * from `scan_diffs` (written by scan-engine), not recomputed here.
 */
export interface SnapshotRecord {
  id: string;
  jobId: string;
  workspaceId: string | null;
  locationId: string | null;
  market: "hk" | "tw";
  observedAt: string;
  scoringVersion: string | null;
  overallScore: number | null;
  coverage: number;
  moduleStates: ModuleStates;
  metrics: SnapshotMetrics;
  websiteChecks: WebsiteChecks | null;
  comparableTo: string | null;
  diffId: string | null;
  createdAt: string;
}

export interface ScanSnapshotRow {
  id: string;
  job_id: string;
  workspace_id: string | null;
  location_id: string | null;
  market: string;
  observed_at: string;
  scoring_version: string | null;
  overall_score: number | string | null;
  coverage: number | string;
  module_states: unknown;
  metrics: unknown;
  website_checks: unknown;
  comparable_to: string | null;
  diff_id: string | null;
  created_at: string;
}

export interface ScanDiffRow {
  id: string;
  base_job_id: string;
  head_job_id: string;
  comparable: boolean;
  incomparable_reason: string | null;
  composite_withheld_reason: string | null;
  intersection_modules: string[];
  composite_base: number | string | null;
  composite_head: number | string | null;
  composite_delta: number | string | null;
  resolved_findings: string[];
  regressed_findings: string[];
  decayed_findings: string[];
  lost_coverage: string[];
  gained_coverage: string[];
  created_at: string;
}

interface SnapshotJobRow {
  id: string;
  workspace_id: string | null;
  location_id: string | null;
  region: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  scoring_version: string | null;
  overall_score: number | string | null;
  score_coverage: number | string | null;
  module_results: unknown;
  module_scores: unknown;
  raw_data: unknown;
  input_snapshot: unknown;
  website_url?: string | null;
}

export interface BuildSnapshotOptions {
  fetchWebsite?: (url: string) => Promise<WebsiteChecks>;
  now?: Date;
}

const EMPTY_STATE = { status: "unavailable", confidence: "none", limitationCode: null, score: null } as const;

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** The job's website URL, whichever of the three places it was recorded in. */
export function websiteUrlOf(job: { website_url?: string | null; input_snapshot: unknown; raw_data: unknown }): string | null {
  if (typeof job.website_url === "string" && job.website_url.trim()) return job.website_url.trim();
  const snapshot = asRecord(job.input_snapshot);
  for (const key of ["websiteUrl", "website_url"]) {
    const value = snapshot?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const website = asRecord(asRecord(asRecord(job.raw_data)?.aeo)?.website);
  return typeof website?.url === "string" && website.url.trim() ? website.url.trim() : null;
}

export function linkComparable(diff: ScanDiffRow | null, snapshotIdForBaseJob: string | null): { comparableTo: string | null; diffId: string | null } {
  if (!diff) return { comparableTo: null, diffId: null };
  return { diffId: diff.id, comparableTo: diff.comparable ? snapshotIdForBaseJob : null };
}

export function rowToSnapshot(row: ScanSnapshotRow): SnapshotRecord {
  const states = asRecord(row.module_states) ?? {};
  const pick = (key: string) => (asRecord(states[key]) as ModuleStates[keyof ModuleStates] | null) ?? { ...EMPTY_STATE };
  return {
    id: row.id,
    jobId: row.job_id,
    workspaceId: row.workspace_id,
    locationId: row.location_id,
    market: row.market === "tw" ? "tw" : "hk",
    observedAt: row.observed_at,
    scoringVersion: row.scoring_version,
    overallScore: toNumber(row.overall_score),
    coverage: toNumber(row.coverage) ?? 0,
    moduleStates: { google_business: pick("google_business"), instagram: pick("instagram"), search_ai: pick("search_ai"), website: pick("website") },
    metrics: (asRecord(row.metrics) as SnapshotMetrics | null) ?? {},
    websiteChecks: (asRecord(row.website_checks) as WebsiteChecks | null) ?? null,
    comparableTo: row.comparable_to,
    diffId: row.diff_id,
    createdAt: row.created_at,
  };
}

const JOB_COLUMNS =
  "id, workspace_id, location_id, region, status, completed_at, created_at, scoring_version, overall_score, score_coverage, module_results, module_scores, raw_data, input_snapshot, website_url";

export async function loadSnapshotForJob(db: SupabaseClient, jobId: string): Promise<SnapshotRecord | null> {
  const { data, error } = await db.from("scan_snapshots").select("*").eq("job_id", jobId).maybeSingle<ScanSnapshotRow>();
  if (error) throw new Error("snapshot lookup failed");
  return data ? rowToSnapshot(data) : null;
}

export async function loadSnapshotById(db: SupabaseClient, snapshotId: string): Promise<SnapshotRecord | null> {
  const { data, error } = await db.from("scan_snapshots").select("*").eq("id", snapshotId).maybeSingle<ScanSnapshotRow>();
  if (error) throw new Error("snapshot lookup failed");
  return data ? rowToSnapshot(data) : null;
}

export async function loadDiffForHeadJob(db: SupabaseClient, jobId: string): Promise<ScanDiffRow | null> {
  const { data, error } = await db
    .from("scan_diffs")
    .select("*")
    .eq("head_job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<ScanDiffRow[]>();
  if (error) throw new Error("diff lookup failed");
  return data?.[0] ?? null;
}

async function ensureSnapshotAudit(db: SupabaseClient, snapshot: SnapshotRecord): Promise<void> {
  // Preserve pre-existing randomly keyed audit rows from earlier releases.
  const { data, error } = await db.from("audit_events").select("id").eq("event", "snapshot.created").eq("entity_id", snapshot.id).limit(1);
  if (error) throw new Error("snapshot audit lookup failed");
  if (data?.length) return;
  const { error: insertError } = await db.from("audit_events").upsert({
    idempotency_key: completionId("snapshot.created", snapshot.id),
    workspace_id: snapshot.workspaceId, location_id: snapshot.locationId,
    actor_type: "scanner", actor_id: null, event: "snapshot.created",
    entity_type: "scan_snapshot", entity_id: snapshot.id,
    payload: { locale: null, coverage: snapshot.coverage, overall_score: snapshot.overallScore, job_id: snapshot.jobId },
  }, { onConflict: "idempotency_key", ignoreDuplicates: true });
  if (insertError) throw new Error("snapshot audit insert failed");
}

/**
 * Build the snapshot for one workspace-linked job. Retries preserve evidence
 * and repair missing audit/link records; they do not re-fetch a saved website. Throws `snapshot_requires_workspace` for an unattached job, so a
 * public scan can never grow workspace rows (guardrail 15).
 */
export async function buildSnapshot(db: SupabaseClient, jobId: string, opts: BuildSnapshotOptions = {}): Promise<SnapshotRecord> {
  const now = opts.now ?? new Date();
  const { data: job, error: jobError } = await db.from("audit_jobs").select(JOB_COLUMNS).eq("id", jobId).maybeSingle<SnapshotJobRow>();
  if (jobError) throw new Error("snapshot job lookup failed");
  if (!job) throw new Error("snapshot_job_not_found");
  if (!job.workspace_id) throw new Error("snapshot_requires_workspace");

  const [findingsResult, aeoResult, diff, existing] = await Promise.all([
    db.from("audit_findings").select("finding_key, evidence").eq("job_id", jobId),
    db.from("aeo_surface_snapshots").select("surface, cited, rank").eq("job_id", jobId),
    loadDiffForHeadJob(db, jobId),
    loadSnapshotForJob(db, jobId),
  ]);
  if (findingsResult.error) throw new Error("snapshot findings lookup failed");
  if (aeoResult.error) throw new Error("snapshot aeo lookup failed");

  if (existing && (existing.workspaceId !== job.workspace_id || existing.locationId !== job.location_id)) {
    throw new Error("snapshot_scope_mismatch");
  }
  if (existing && (!diff || (existing.diffId === diff.id && (!diff.comparable || existing.comparableTo)))) {
    await ensureSnapshotAudit(db, existing);
    return existing;
  }
  const websiteUrl = websiteUrlOf(job);
  const websiteChecks = existing ? existing.websiteChecks : websiteUrl ? await (opts.fetchWebsite ?? runWebsiteChecks)(websiteUrl) : null;

  const moduleStates = existing?.moduleStates ?? deriveModuleStates(job, websiteChecks, Boolean(websiteUrl));
  const metrics = existing?.metrics ?? deriveMetrics({
    rawData: job.raw_data,
    findings: (findingsResult.data ?? []) as Array<{ finding_key: string; evidence: Record<string, unknown> | null }>,
    aeoRows: (aeoResult.data ?? []) as Array<{ surface: string; cited: boolean; rank: number | null }>,
    websiteChecks,
    now,
  });

  let baseSnapshotId: string | null = null;
  if (diff?.comparable) {
    const base = await loadSnapshotForJob(db, diff.base_job_id);
    baseSnapshotId = base?.id ?? null;
  }
  const link = linkComparable(diff, baseSnapshotId);

  const row = {
    job_id: jobId,
    workspace_id: job.workspace_id,
    location_id: job.location_id,
    market: job.region === "tw" ? "tw" : "hk",
    observed_at: job.completed_at ?? job.created_at,
    scoring_version: job.scoring_version,
    overall_score: toNumber(job.overall_score),
    coverage: toNumber(job.score_coverage) ?? 0,
    module_states: moduleStates,
    metrics,
    website_checks: websiteChecks,
    comparable_to: link.comparableTo,
    diff_id: link.diffId,
  };

  const { data: saved, error: saveError } = await db
    .from("scan_snapshots")
    .upsert(row, { onConflict: "job_id" })
    .select("*")
    .single<ScanSnapshotRow>();
  if (saveError || !saved) throw new Error("snapshot upsert failed");

  const snapshot = rowToSnapshot(saved);
  await ensureSnapshotAudit(db, snapshot);
  return snapshot;
}
