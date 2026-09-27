import "server-only";
import type { Pool } from "pg";
import {
  asClaimedJob,
  mergeFindingKeysIntoModuleResults,
  forwardEventToPostHog,
  type ScanExecutionStore,
  type AnalyticsDependencies,
  type PersistDiffDeps,
  type PersistAeoSnapshotsDeps,
} from "@sme-scanner/scan-engine";
import { getPool } from "../db/client";
import { withTransaction } from "../db/transaction";
import { capturePostHog } from "../analytics/posthog";
import { writeScanEventSafely, scanCompletedEvent, SCAN_TERMINAL_DEDUPE_KEY } from "../analytics/scan-events";
import { claimScanJob, type ClaimOutcome, type ScanBudgetScope } from "../budgets/scan";

type ExecutionPool = Pick<Pool, "query" | "connect">;
export function createScanExecutionStore(
  anonymousSessionId: string,
  options: {
    pool?: ExecutionPool;
    analytics?: AnalyticsDependencies;
    waitUntil?: (promise: Promise<unknown>) => void;
    /** Budget variables; defaults to process.env (tests pass their own). */
    env?: Record<string, string | undefined>;
    /**
     * Called when a metered claim (a retry, or a first attempt whose
     * reservation has expired) was refused on budget. processScan knows
     * only "a claimed job or null" and reports null as already_claimed, so the
     * host (lib/scan/run.ts) learns the reason here. packages/scan-engine is
     * unchanged.
     */
    onBudgetRefused?: (scope: ScanBudgetScope) => void;
  } = {},
): ScanExecutionStore {
  const pool = () => options.pool ?? getPool();
  // The store never calls analytics.insert: scan_completed is written inside
  // persist()/fail(). insert exists only because AnalyticsDependencies
  // requires it and forwardEventToPostHog takes that type. It throws so a
  // regression back to recordEvent cannot write a duplicate NULL-key
  // scan_completed row. It does not fail loudly: the engine's recordEvent
  // catches the throw, reports backend_unavailable and skips forwarding, so a
  // regression would show up as backend_unavailable logs and missing PostHog
  // events.
  const analytics: AnalyticsDependencies = options.analytics ?? {
    insert: async () => {
      throw new Error("scan_events are written by the store, not analytics.insert");
    },
    capturePostHog,
    reportError: (category) =>
      console.error("[analytics] event_record_failed", { category }),
  };
  return {
    async claimJob(jobId) {
      // P3.5a: its own short transaction. The budget lock, then one statement
      // that claims and writes the job's scan_attempts row together
      // (lib/budgets/scan.ts). It commits before collection starts, so no
      // transaction is held open across provider calls.
      let outcome: ClaimOutcome;
      try {
        outcome = await withTransaction((client) => claimScanJob(client, jobId, options.env), pool());
      } catch {
        throw new Error("claim_failed");
      }
      if (outcome.kind === "at_capacity") {
        options.onBudgetRefused?.(outcome.scope);
        return null;
      }
      if (outcome.kind === "paused") {
        options.onBudgetRefused?.("scan_paused");
        return null;
      }
      return outcome.kind === "claimed" ? asClaimedJob(outcome.row) : null;
    },
    async setStage(jobId, stage) {
      const status =
        stage === "collecting_ig_gbp" || stage === "collecting_aeo"
          ? "collecting"
          : stage;
      try {
        await pool().query(
          "UPDATE audit_jobs SET processing_stage=$2,status=$3 WHERE id=$1",
          [jobId, stage, status],
        );
      } catch {
        throw new Error("stage_persistence_failed");
      }
    },
    async persist(result) {
      // Validated before the transaction opens; see lib/analytics/scan-events.ts.
      const completed = scanCompletedEvent(result.status, result.coverage);
      await withTransaction(async (client) => {
        try {
          for (const finding of result.findings) {
            await client.query(
              `INSERT INTO audit_findings(job_id,finding_key,module,severity,score_impact,owner_message_zh,owner_message_en,owner_action_zh,owner_action_en,evidence,v02_agent_hint)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
       ON CONFLICT(job_id,finding_key) DO UPDATE SET module=EXCLUDED.module,severity=EXCLUDED.severity,score_impact=EXCLUDED.score_impact,owner_message_zh=EXCLUDED.owner_message_zh,owner_message_en=EXCLUDED.owner_message_en,owner_action_zh=EXCLUDED.owner_action_zh,owner_action_en=EXCLUDED.owner_action_en,evidence=EXCLUDED.evidence,v02_agent_hint=EXCLUDED.v02_agent_hint`,
              [
                result.jobId,
                finding.finding_key,
                finding.module,
                finding.severity,
                finding.score_impact,
                finding.owner_message_zh,
                finding.owner_message_en ?? null,
                finding.owner_action_zh ?? null,
                finding.owner_action_en ?? null,
                JSON.stringify(finding.evidence),
                finding.v02_agent_hint ?? null,
              ],
            );
          }
        } catch {
          throw new Error("persist_findings_failed");
        }
        const scores = Object.fromEntries(
          Object.entries(result.moduleResults)
            .filter(([, module]) => module.score !== null)
            .map(([key, module]) => [key, { score: module.score }]),
        );
        try {
          const updated = await client.query(
            `UPDATE audit_jobs SET status=$2,processing_stage=$2,overall_score=$3,module_scores=$4::jsonb,module_results=$5::jsonb,score_coverage=$6,scoring_version=$7,raw_data=$8::jsonb,completed_at=now() WHERE id=$1 RETURNING id`,
            [
              result.jobId,
              result.status,
              result.overall,
              JSON.stringify(scores),
              JSON.stringify(result.moduleResults),
              result.coverage,
              result.scoringVersion,
              JSON.stringify(result.rawData ?? null),
            ],
          );
          if (!updated.rowCount) throw new Error("missing_job");
        } catch {
          throw new Error("persist_job_failed");
        }
        // Best-effort inside this transaction: a failed event write rolls back
        // only its savepoint, so the scored scan above still commits.
        await writeScanEventSafely(client, {
          jobId: result.jobId,
          anonymousSessionId,
          event: completed,
          dedupeKey: SCAN_TERMINAL_DEDUPE_KEY,
        });
      }, pool());
    },
    async fail(failure) {
      const completed = scanCompletedEvent("failed", 0);
      try {
        return await withTransaction(async (client) => {
          const result = await client.query(
            `UPDATE audit_jobs SET status='failed',processing_stage='failed',failure_category=$2,failure_correlation_id=$3,completed_at=now()
             WHERE id=$1 AND status IN ('collecting','scoring','persisting') RETURNING id`,
            [failure.jobId, failure.category, failure.correlationId],
          );
          // Only a job this call actually moved to failed gets the event; one
          // that was already terminal gets nothing.
          if (!result.rows.length) return false;
          await writeScanEventSafely(client, {
            jobId: failure.jobId,
            anonymousSessionId,
            event: completed,
            dedupeKey: SCAN_TERMINAL_DEDUPE_KEY,
          });
          return true;
        }, pool());
      } catch {
        throw new Error("failure_persistence_failed");
      }
    },
    async recordTerminal(transition) {
      const waitUntil = options.waitUntil ?? analytics.waitUntil;
      // The durable row was written inside persist()/fail(). Only transport is
      // left. It must not go through recordEvent: that inserts again, and with
      // its default NULL dedupe key it never conflicts, so it would write a
      // duplicate scan_completed row before forwarding.
      const pending = forwardEventToPostHog(
        scanCompletedEvent(transition.status, transition.coverage),
        anonymousSessionId,
        analytics,
      );
      try {
        waitUntil?.(
          pending.then(
            () => {},
            () => {},
          ),
        );
      } catch {
        /* Closed host lifetime cannot fail a report. */
      }
      await pending;
    },
  };
}

export function buildTrendDiffDeps(
  pool: Pick<Pool, "query">,
  jobId: string,
): PersistDiffDeps {
  const load = async (id: string) => {
    const { rows } = await pool.query(
      "SELECT id,place_id,created_at,scoring_version,module_results FROM audit_jobs WHERE id=$1",
      [id],
    );
    if (!rows[0]) return null;
    const findings = await pool.query(
      "SELECT module,finding_key FROM audit_findings WHERE job_id=$1",
      [id],
    );
    return {
      ...rows[0],
      created_at: rows[0].created_at.toISOString(),
      module_results: mergeFindingKeysIntoModuleResults(
        rows[0].module_results,
        findings.rows,
      ),
    };
  };
  return {
    loadHead: () => load(jobId),
    loadJob: load,
    listCandidates: async (placeId) =>
      (
        await pool.query(
          "SELECT id,status,created_at FROM audit_jobs WHERE place_id=$1 ORDER BY created_at DESC LIMIT 12",
          [placeId],
        )
      ).rows.map((row) => ({
        ...row,
        created_at: row.created_at.toISOString(),
      })),
    saveDiff: async (row) => {
      await pool.query(
        `INSERT INTO scan_diffs(base_job_id,head_job_id,comparable,incomparable_reason,composite_withheld_reason,intersection_modules,composite_base,composite_head,composite_delta,resolved_findings,regressed_findings,decayed_findings,lost_coverage,gained_coverage)
    SELECT base_job_id,head_job_id,comparable,incomparable_reason,composite_withheld_reason,intersection_modules,composite_base,composite_head,composite_delta,resolved_findings,regressed_findings,decayed_findings,lost_coverage,gained_coverage FROM jsonb_populate_record(null::scan_diffs,$1::jsonb)
    ON CONFLICT(base_job_id,head_job_id) DO UPDATE SET comparable=EXCLUDED.comparable,incomparable_reason=EXCLUDED.incomparable_reason,composite_withheld_reason=EXCLUDED.composite_withheld_reason,intersection_modules=EXCLUDED.intersection_modules,composite_base=EXCLUDED.composite_base,composite_head=EXCLUDED.composite_head,composite_delta=EXCLUDED.composite_delta,resolved_findings=EXCLUDED.resolved_findings,regressed_findings=EXCLUDED.regressed_findings,decayed_findings=EXCLUDED.decayed_findings,lost_coverage=EXCLUDED.lost_coverage,gained_coverage=EXCLUDED.gained_coverage`,
        [JSON.stringify(row)],
      );
    },
  };
}
export function buildAeoSnapshotDeps(
  pool: Pick<Pool, "query">,
): PersistAeoSnapshotsDeps {
  return {
    loadJob: async (jobId) =>
      (
        await pool.query(
          "SELECT place_id,raw_data,input_snapshot FROM audit_jobs WHERE id=$1",
          [jobId],
        )
      ).rows[0] ?? null,
    saveSnapshots: async (rows) => {
      await pool.query(
        `INSERT INTO aeo_surface_snapshots(job_id,place_id,surface,query_text,locale,market,cited,rank,competitors,excerpt)
    SELECT job_id,place_id,surface,query_text,locale,market,cited,rank,competitors,excerpt FROM jsonb_populate_recordset(null::aeo_surface_snapshots,$1::jsonb)
    ON CONFLICT(job_id,surface,query_text) DO UPDATE SET place_id=EXCLUDED.place_id,locale=EXCLUDED.locale,market=EXCLUDED.market,cited=EXCLUDED.cited,rank=EXCLUDED.rank,competitors=EXCLUDED.competitors,excerpt=EXCLUDED.excerpt`,
        [JSON.stringify(rows)],
      );
    },
  };
}
