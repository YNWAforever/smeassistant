import { scoreAll } from "@sme-scanner/scoring";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvidenceCandidate } from "@sme-scanner/contracts";
import { persistScanDiff, type PersistDiffDeps } from "./persist-diff";
import { persistAeoSnapshots, type PersistAeoSnapshotsDeps } from "./persist-aeo-snapshots";
import { mergeFindingKeysIntoModuleResults, type StoredFinding } from "./merge-finding-keys";
import { recordEvent, createAnalyticsDependencies } from "./analytics";
import {
  asClaimedJob,
  createScanProcessor,
  type ScanPersistence,
  type ScanProcessResult,
  type ScanProviderCollector,
  type ScanStage,
  type ScanFailure,
} from "./processor";

export interface ScanExecutionRuntime {
  supabase: SupabaseClient;
  anonymousSessionId: string;
  collect: ScanProviderCollector;
  /**
   * No default: unlike persistDiff/persistAeoSnapshots, this package cannot
   * construct a real implementation itself -- the only implementation
   * (persistEvidenceSnapshots, which imports sharp) lives in apps/web and
   * must never be imported here. Every caller must supply one: apps/web
   * wires the real function directly; a Cloudflare Worker caller (see the
   * L6 design doc, a separate not-yet-written plan) will wire an HTTP call
   * to apps/web's evidence-persistence route instead.
   *
   * Signature matches ScanProcessorDependencies["persistEvidence"] in
   * ./processor -- it takes the collected evidence candidates directly
   * rather than re-deriving them, so this cannot be simplified to
   * `(jobId: string) => Promise<unknown>`.
   */
  persistEvidence: (jobId: string, candidates: EvidenceCandidate[]) => Promise<void>;
  /** Injected so a test can prove a failing diff never fails the scan. */
  persistDiff?: (jobId: string) => Promise<unknown>;
  /** Injected so a test can prove a failing snapshot write never fails the scan. */
  persistAeoSnapshots?: (jobId: string) => Promise<unknown>;
  /**
   * Forwarded into createAnalyticsDependencies for the terminal scan_completed
   * event. On Node the process outlives the response and this is unnecessary;
   * a Cloudflare Worker caller passes ctx.waitUntil so the fire-and-forget
   * PostHog capture isn't killed when the handler's work resolves. apps/web
   * supplies nothing.
   */
  waitUntil?: (promise: Promise<unknown>) => void;
}

function statusForStage(stage: ScanStage): "collecting" | "scoring" | "persisting" | "done" | "partial" | "failed" {
  if (stage === "collecting" || stage === "collecting_ig_gbp" || stage === "collecting_aeo") return "collecting";
  return stage;
}

async function claimJob(supabase: SupabaseClient, jobId: string) {
  const { data, error } = await supabase.rpc("claim_audit_job", { p_job_id: jobId });
  if (error) throw new Error(`claim failed: ${error.message}`);
  return asClaimedJob(data);
}

async function setProcessingStage(
  supabase: SupabaseClient,
  jobId: string,
  stage: ScanStage,
) {
  const { error } = await supabase
    .from("audit_jobs")
    .update({ processing_stage: stage, status: statusForStage(stage) })
    .eq("id", jobId);
  if (error) throw new Error("stage_persistence_failed");
}

async function persistScanResult(
  supabase: SupabaseClient,
  result: ScanPersistence,
) {
  const { error: findingsError } = await supabase.from("audit_findings").upsert(
    result.findings.map((finding) => ({
      job_id: result.jobId,
      finding_key: finding.finding_key,
      module: finding.module,
      severity: finding.severity,
      score_impact: finding.score_impact,
      owner_message_zh: finding.owner_message_zh,
      owner_message_en: finding.owner_message_en ?? null,
      owner_action_zh: finding.owner_action_zh ?? null,
      owner_action_en: finding.owner_action_en ?? null,
      evidence: finding.evidence,
      v02_agent_hint: finding.v02_agent_hint ?? null,
    })),
    { onConflict: "job_id,finding_key" },
  );
  if (findingsError) throw new Error("persist_findings_failed");

  const legacyScores = Object.fromEntries(
    Object.entries(result.moduleResults)
      .filter(([, module]) => module.score !== null)
      .map(([key, module]) => [key, { score: module.score as number }]),
  );
  const { error: jobError } = await supabase
    .from("audit_jobs")
    .update({
      status: result.status,
      processing_stage: result.status,
      overall_score: result.overall,
      module_scores: legacyScores,
      module_results: result.moduleResults,
      score_coverage: result.coverage,
      scoring_version: result.scoringVersion,
      raw_data: result.rawData ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", result.jobId);
  if (jobError) throw new Error("persist_job_failed");
}

async function recordScanCompleted(
  transition: Pick<ScanPersistence, "jobId" | "status" | "coverage">,
  anonymousSessionId: string,
  supabase: SupabaseClient,
  waitUntil?: (promise: Promise<unknown>) => void,
) {
  // processor.ts calls recordTerminal fire-and-forget (`void deps.recordTerminal(...)`)
  // so a merchant's report is never delayed by analytics latency -- there is no
  // await between that call and the processor returning. Registering only
  // recordEvent's own internal PostHog tail with waitUntil (the old shape, a bare
  // `await recordEvent(...)`) leaves the scan_events insert itself unregistered:
  // on a failed scan there is no post-processing Promise.allSettled to provide
  // incidental cover, so the outer ctx.waitUntil can settle while that insert is
  // still in flight and the event is silently dropped. Capturing the whole
  // promise and registering it before awaiting closes that gap.
  const pending = recordEvent(
    { name: "scan_completed", properties: { outcome: transition.status, coverage: transition.coverage } },
    { jobId: transition.jobId, anonymousSessionId },
    { ...createAnalyticsDependencies(() => supabase), waitUntil },
  );
  // `await pending` below and processor.ts's own recordTerminal .catch both
  // already attach handlers, so pending itself never becomes an *unhandled*
  // rejection. But ctx.waitUntil registers a promise for the platform to
  // track directly; handing it one that can still reject risks that surfacing
  // as invocation-level noise even though nothing here is unhandled. Give it
  // an always-resolving view instead -- registration timing is unchanged.
  waitUntil?.(pending.then(() => {}, () => {}));
  await pending;
}

async function persistScanFailure(
  supabase: SupabaseClient,
  failure: ScanFailure,
) {
  const { data, error } = await supabase
    .from("audit_jobs")
    .update({
      status: "failed",
      processing_stage: "failed",
      failure_category: failure.category,
      failure_correlation_id: failure.correlationId,
      completed_at: new Date().toISOString(),
    })
    .eq("id", failure.jobId)
    .in("status", ["collecting", "scoring", "persisting"])
    .select("id");
  if (error) throw new Error("failure_persistence_failed");
  return Array.isArray(data) && data.length > 0;
}

/**
 * The report is already persisted before these steps run, so a slow
 * post-processing step has nothing to gain by waiting. Bounding it keeps a
 * hung call from occupying the invocation until the platform's maxDuration
 * kills it — which would skip the catch below and leave no log line at all.
 * Shared by the trend-diff and AEO-snapshot steps: both are "best-effort,
 * bounded, never block report delivery" in the same way.
 */
const POST_PROCESSING_TIMEOUT_MS = 10_000;

/**
 * finding_key lives only in audit_findings, keyed by (job_id, module) — never
 * inside module_results itself. Without this, toDiffInput's findingKeys read
 * always defaults to empty, and every stored diff would report zero
 * resolved/regressed/decayed findings regardless of what actually changed.
 */
async function loadModuleResultsWithFindings(
  supabase: SupabaseClient,
  jobId: string,
  moduleResults: Record<string, unknown> | null,
) {
  const { data, error } = await supabase
    .from("audit_findings")
    .select("module, finding_key")
    .eq("job_id", jobId);
  if (error) throw new Error("diff_findings_read_failed");
  return mergeFindingKeysIntoModuleResults(moduleResults, (data ?? []) as StoredFinding[]);
}

/**
 * Exported so an integration test can build the same deps this file uses in
 * production and call `persistScanDiff` with them directly, instead of
 * maintaining a hand-copied second set of these five queries that nothing
 * would catch drifting out of sync.
 */
export function buildTrendDiffDeps(
  supabase: SupabaseClient,
  jobId: string,
): PersistDiffDeps {
  return {
    loadHead: async () => {
      const { data, error } = await supabase
        .from("audit_jobs")
        .select("id, place_id, created_at, scoring_version, module_results")
        .eq("id", jobId)
        .maybeSingle();
      // A failed read is not an absent row. Collapsing the two would report a
      // database outage as "nothing to compare" and log nothing at all, because
      // persistScanDiff resolves on a missing row rather than throwing.
      if (error) throw new Error("diff_head_read_failed");
      if (!data) return null;
      const row = data as {
        id: string;
        place_id: string | null;
        created_at: string;
        scoring_version: string | null;
        module_results: Record<string, unknown> | null;
      };
      return {
        ...row,
        module_results: await loadModuleResultsWithFindings(supabase, row.id, row.module_results),
      };
    },
    listCandidates: async (placeId: string) => {
      // Uses audit_jobs_place_created_idx, added by the scan_schedules migration.
      const { data, error } = await supabase
        .from("audit_jobs")
        .select("id, status, created_at")
        .eq("place_id", placeId)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw new Error("diff_candidates_read_failed");
      return (data as never) ?? [];
    },
    loadJob: async (id: string) => {
      const { data, error } = await supabase
        .from("audit_jobs")
        .select("scoring_version, module_results")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error("diff_base_read_failed");
      if (!data) return null;
      const row = data as { scoring_version: string | null; module_results: Record<string, unknown> | null };
      return {
        ...row,
        module_results: await loadModuleResultsWithFindings(supabase, id, row.module_results),
      };
    },
    saveDiff: async (row) => {
      // onConflict makes a re-processed job idempotent rather than a duplicate.
      const { error } = await supabase
        .from("scan_diffs")
        .upsert(row, { onConflict: "base_job_id,head_job_id" });
      if (error) throw new Error("diff_persistence_failed");
    },
  };
}

async function persistTrendDiffForJob(supabase: SupabaseClient, jobId: string) {
  return persistScanDiff(jobId, buildTrendDiffDeps(supabase, jobId));
}

/**
 * Exported for the same reason as buildTrendDiffDeps: an integration test
 * builds these against a real Postgres instance and calls persistAeoSnapshots
 * directly, rather than re-implementing the two queries by hand.
 */
export function buildAeoSnapshotDeps(
  supabase: SupabaseClient,
): PersistAeoSnapshotsDeps {
  return {
    loadJob: async (jobId: string) => {
      const { data, error } = await supabase
        .from("audit_jobs")
        .select("place_id, raw_data, input_snapshot")
        .eq("id", jobId)
        .maybeSingle();
      if (error) throw new Error("aeo_snapshot_job_read_failed");
      return data as never;
    },
    saveSnapshots: async (rows) => {
      const { error } = await supabase
        .from("aeo_surface_snapshots")
        .upsert(rows, { onConflict: "job_id,surface,query_text" });
      if (error) throw new Error("aeo_snapshot_persistence_failed");
    },
  };
}

async function persistAeoSnapshotsForJob(supabase: SupabaseClient, jobId: string) {
  return persistAeoSnapshots(jobId, buildAeoSnapshotDeps(supabase));
}

/**
 * Runs one bounded, best-effort post-processing step. A failure here is
 * logged and swallowed — never rethrown — because by the time this runs the
 * scan's own result (the merchant's report) is already fully persisted and
 * must be returned regardless of what happens next.
 */
async function runBoundedPostProcessingStep(
  fn: (jobId: string) => Promise<unknown>,
  jobId: string,
  logMessage: string,
  category: string,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      fn(jobId),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("step_timed_out")), POST_PROCESSING_TIMEOUT_MS);
      }),
    ]);
  } catch {
    console.error(logMessage, { jobId, category });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createScanExecution(runtime: ScanExecutionRuntime) {
  const processor = createScanProcessor({
    claimJob: (jobId) => claimJob(runtime.supabase, jobId),
    collect: runtime.collect,
    score: scoreAll,
    setStage: (jobId, stage) => setProcessingStage(runtime.supabase, jobId, stage),
    persist: (result) => persistScanResult(runtime.supabase, result),
    persistEvidence: runtime.persistEvidence,
    recordTerminal: (transition) =>
      recordScanCompleted(transition, runtime.anonymousSessionId, runtime.supabase, runtime.waitUntil),
    fail: (failure) => persistScanFailure(runtime.supabase, failure),
  });

  const runDiff = runtime.persistDiff ?? ((jobId: string) => persistTrendDiffForJob(runtime.supabase, jobId));
  const runAeoSnapshots =
    runtime.persistAeoSnapshots ?? ((jobId: string) => persistAeoSnapshotsForJob(runtime.supabase, jobId));

  return async (jobId: string) => {
    const result = await processor(jobId);
    // Never in the scan's critical path: a merchant's report is delivered
    // whether or not last month's comparison or the AEO snapshot write
    // succeeded. Run concurrently, not sequentially — sequential bounded
    // steps would double the worst-case added latency after the report is
    // already fully persisted.
    if (result.status === "done" || result.status === "partial") {
      await Promise.allSettled([
        runBoundedPostProcessingStep(runDiff, jobId, "[scan/diff] trend diff failed", "diff_persist_failed"),
        runBoundedPostProcessingStep(
          runAeoSnapshots,
          jobId,
          "[scan/aeo-snapshots] persist failed",
          "aeo_snapshot_persist_failed",
        ),
      ]);
    }
    return result;
  };
}

export async function processScan(
  jobId: string,
  anonymousSessionId: string,
  collect: ScanProviderCollector,
  persistEvidence: (jobId: string, candidates: EvidenceCandidate[]) => Promise<void>,
  supabase: SupabaseClient,
): Promise<ScanProcessResult> {
  return createScanExecution({
    supabase,
    anonymousSessionId,
    collect,
    persistEvidence,
  })(jobId);
}
