import "server-only";
import type { Pool } from "pg";
import {
  asClaimedJob,
  mergeFindingKeysIntoModuleResults,
  recordEvent,
  type ScanExecutionStore,
  type AnalyticsDependencies,
  type PersistDiffDeps,
  type PersistAeoSnapshotsDeps,
} from "@sme-scanner/scan-engine";
import { getPool } from "../db/client";
import { withTransaction } from "../db/transaction";
import { eventRepository } from "../repositories/events";
import { capturePostHog } from "../analytics/posthog";

type ExecutionPool = Pick<Pool, "query" | "connect">;
export function createScanExecutionStore(
  anonymousSessionId: string,
  options: {
    pool?: ExecutionPool;
    analytics?: AnalyticsDependencies;
    waitUntil?: (promise: Promise<unknown>) => void;
  } = {},
): ScanExecutionStore {
  const pool = () => options.pool ?? getPool();
  const analytics: AnalyticsDependencies = options.analytics ?? {
    insert: (row, signal) => eventRepository(pool()).insert(row, signal),
    capturePostHog,
    reportError: (category) =>
      console.error("[analytics] event_record_failed", { category }),
  };
  return {
    async claimJob(jobId) {
      try {
        const result = await pool().query(
          `UPDATE audit_jobs SET status='collecting',processing_stage='collecting',attempt_count=attempt_count+1,last_attempt_at=now()
     WHERE id=$1 AND (status='queued' OR (status IN ('collecting','scoring','persisting') AND attempt_count<3 AND last_attempt_at IS NOT NULL AND last_attempt_at<now()-interval '30 minutes')) RETURNING *`,
          [jobId],
        );
        return asClaimedJob(result.rows);
      } catch {
        throw new Error("claim_failed");
      }
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
      }, pool());
    },
    async fail(failure) {
      try {
        const result = await pool().query(
          `UPDATE audit_jobs SET status='failed',processing_stage='failed',failure_category=$2,failure_correlation_id=$3,completed_at=now() WHERE id=$1 AND status IN ('collecting','scoring','persisting') RETURNING id`,
          [failure.jobId, failure.category, failure.correlationId],
        );
        return result.rows.length > 0;
      } catch {
        throw new Error("failure_persistence_failed");
      }
    },
    async recordTerminal(transition) {
      const waitUntil = options.waitUntil ?? analytics.waitUntil;
      const pending = recordEvent(
        {
          name: "scan_completed",
          properties: {
            outcome: transition.status,
            coverage: transition.coverage,
          },
        },
        { jobId: transition.jobId, anonymousSessionId },
        { ...analytics, waitUntil },
      );
      // Register the insert immediately as well as recordEvent's eventual PostHog tail.
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
