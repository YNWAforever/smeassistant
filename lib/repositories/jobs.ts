import "server-only";
import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { getPool } from "../db/client";
import { withTransaction } from "../db/transaction";
import { admitScanJob } from "../budgets/scan";
import { DEAD_LETTERED_JOB_CONDITION_SQL, LOCATION_LIVE_JOB_SQL } from "../scan/claimable";
import { auditJobs } from "../db/schema/jobs";
import type { buildScanConsentInsert, buildScanJobInsert } from "../scan/start-job";
import {
    scanCompletedEvent,
    writeScanEventSafely,
    SCAN_STARTED_DEDUPE_KEY,
    SCAN_TERMINAL_DEDUPE_KEY,
    type ScanStartedWrite,
} from "../analytics/scan-events";
/** F-13: the client's per-submission key and what it was first used for. */
export interface ScanSubmission {
    key: string;
    fingerprint: string;
}
/** F-13: a rescan reuses its location's live job (LOCATION_LIVE_JOB_SQL) instead of queueing another. */
export interface ScanLocationGuard {
    workspaceId: string;
    locationId: string;
}
/** The key was already used for a different scan; nothing was written. */
export class ScanSubmissionConflict extends Error {
    constructor() {
        super("submission_key_conflict");
        this.name = "ScanSubmissionConflict";
    }
}
/** Namespaced and hashed: audit_events.idempotency_key is shared by several writers. */
export function scanSubmissionIdempotencyKey(key: string): string {
    return `scan_submission:${createHash("sha256").update(key).digest("hex")}`;
}
export interface JobsRepository {
    insert(
        row: ReturnType<typeof buildScanJobInsert>,
        consent: ReturnType<typeof buildScanConsentInsert>,
        started: ScanStartedWrite,
        guard?: ScanSubmission | ScanLocationGuard,
    ): Promise<{
        id: string;
        replayed?: boolean;
    }>;
}
export const jobsRepository: JobsRepository & {
    readStatus(id: string): Promise<ScanStatus | null>;
    readScanConsent(jobId: string): Promise<{ granted: boolean; policy_version: string } | null>;
    failQueued(jobId: string, category: string, correlationId: string, anonymousSessionId: string): Promise<boolean>;
} = {
    /**
     * The job and its scan-time consent are atomic: consent_records.job_id is
     * NOT NULL, so the consent row can only be written after the job exists,
     * and writing them separately would leave a window where a queued job has
     * no consent. A failure in either statement rolls both back.
     *
     * scan_started is written in the same transaction, on the same connection,
     * rather than fire-and-forget afterwards, because the old path lost it
     * (F-34): a 250 ms budget around a fresh connect, and a bare promise Vercel
     * may freeze after the response. It is best-effort inside that transaction:
     * writeScanEventSafely puts it in a SAVEPOINT, so a failed event write
     * rolls back only the event, is logged, and the job and consent still
     * commit. The missing event is then a counted gap in the value report's
     * reconciliation, which counts lost events per week without naming them;
     * the event_record_failed log line (job id, SQLSTATE) identifies the job.
     */
    async insert(row, consent, started, guard) {
        const submission = guard && "key" in guard ? guard : undefined;
        const location = guard && "locationId" in guard ? guard : undefined;
        return withTransaction(async (client) => {
            // F-13: a second rescan of a location while the first is still under
            // way returns that job. Same serialization as below, keyed on the
            // location, so two concurrent presses cannot both pass the check.
            if (location) {
                await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`rescan_location:${location.locationId}`]);
                const live = (await client.query<{ id: string }>(LOCATION_LIVE_JOB_SQL, [location.workspaceId, location.locationId])).rows[0];
                if (live) return { id: live.id, replayed: true };
            }
            // F-13: a retried submission returns the job it already created,
            // before the budget admission, so it is never admitted or charged
            // twice. The advisory lock serializes concurrent duplicates: the
            // second waits for the first to commit, then finds its row. The
            // unique audit_events.idempotency_key index is the backstop.
            const idempotencyKey = submission ? scanSubmissionIdempotencyKey(submission.key) : null;
            if (submission && idempotencyKey) {
                await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [idempotencyKey]);
                const prior = (await client.query<{ entity_id: string; fingerprint: string | null }>(
                    "SELECT entity_id, payload->>'fingerprint' AS fingerprint FROM audit_events WHERE idempotency_key=$1",
                    [idempotencyKey],
                )).rows[0];
                if (prior) {
                    if (prior.fingerprint !== submission.fingerprint) throw new ScanSubmissionConflict();
                    return { id: prior.entity_id, replayed: true };
                }
            }
            // P3.5a: the spend budget, first, on this transaction's client and
            // under the budget lock, so the pending count it reads and the job
            // it admits commit together. A refusal throws ScanBudgetRefusal
            // before anything is written. Only the rescan path attributes a
            // workspace (the public route never forwards one), so the row's
            // workspace names the entry.
            await admitScanJob(client, {
                workspaceId: row.workspace_id ?? null,
                entry: row.workspace_id ? "rescan" : "scan_start",
            });
            const values: typeof auditJobs.$inferInsert = {
                businessName: row.business_name, igHandle: row.ig_handle, websiteUrl: row.website_url,
                industry: row.industry, district: row.district, userRole: row.user_role, status: row.status,
                shareSlug: row.share_slug, region: row.region, businessObjective: row.business_objective,
                inputSnapshot: row.input_snapshot, placeId: row.place_id, placeMatchConfidence: row.place_match_confidence,
                parentJobId: row.parent_job_id, workspaceId: row.workspace_id, locationId: row.location_id,
            };
            const [created] = await drizzle(client).insert(auditJobs).values(values).returning({ id: auditJobs.id });
            if (!created)
                throw new Error("scan_insert_missing");
            // lead_id is NULL by design: no lead exists at scan time, and the
            // column is nullable precisely for this case.
            await client.query(
                "INSERT INTO consent_records(job_id,lead_id,consent_type,granted,policy_version,locale) VALUES($1,NULL,$2,$3,$4,$5)",
                [created.id, consent.consent_type, consent.granted, consent.policy_version, consent.locale],
            );
            // Not best-effort like scan_started: without this row a retry would
            // queue a second paid scan, so a failure here rolls the job back.
            if (submission && idempotencyKey) {
                await client.query(
                    `INSERT INTO audit_events(idempotency_key,workspace_id,location_id,actor_type,actor_id,event,entity_type,entity_id,payload)
                     VALUES($1,$2,$3,'user',NULL,'scan.queued','audit_job',$4,$5::jsonb)`,
                    [idempotencyKey, row.workspace_id ?? null, row.location_id ?? null, created.id, JSON.stringify({ trigger: "public_scan", fingerprint: submission.fingerprint })],
                );
            }
            await writeScanEventSafely(client, {
                jobId: created.id,
                anonymousSessionId: started.anonymousSessionId,
                event: started.event,
                dedupeKey: SCAN_STARTED_DEDUPE_KEY,
            });
            return created;
        });
    },
    /** Newest row wins. Only `granted = true` rows are written today. */
    async readScanConsent(jobId) {
        const { rows } = await getPool().query<{ granted: boolean; policy_version: string }>(
            "SELECT granted, policy_version FROM consent_records WHERE job_id=$1 AND consent_type='public_evidence' ORDER BY recorded_at DESC LIMIT 1",
            [jobId],
        );
        return rows[0] ?? null;
    },
    /**
     * Guarded to `queued` so it can never race a job the executor has already
     * claimed. A queued job with no consent row is terminally failed on its first
     * dispatch attempt -- the intended fail-closed behaviour.
     *
     * This is a terminal writer like the store's fail(), so it records the
     * job's scan_completed (outcome failed, coverage 0) in the same
     * transaction; without it every consent-refused scan would be a permanent
     * reconciliation gap for an event that was never going to exist. Only a
     * job this call actually moved to failed gets the event, and the write is
     * in a SAVEPOINT, so a failed event write never keeps the job queued. A
     * write that does fail is a counted (unnamed) gap in reconciliation and
     * is identified by the event_record_failed log line.
     */
    async failQueued(jobId, category, correlationId, anonymousSessionId) {
        const completed = scanCompletedEvent("failed", 0);
        return withTransaction(async (client) => {
            const { rows } = await client.query<{ id: string }>(
                "UPDATE audit_jobs SET status='failed',processing_stage='failed',failure_category=$2,failure_correlation_id=$3,completed_at=now() WHERE id=$1 AND status='queued' RETURNING id",
                [jobId, category, correlationId],
            );
            if (!rows.length) return false;
            await writeScanEventSafely(client, {
                jobId,
                anonymousSessionId,
                event: completed,
                dedupeKey: SCAN_TERMINAL_DEDUPE_KEY,
            });
            return true;
        });
    },
    async readStatus(id) {
        const { rows } = await getPool().query<ScanStatus>(`SELECT id,status,processing_stage,share_slug,score_coverage::float8 AS score_coverage,failure_correlation_id,module_results,module_scores,${DEAD_LETTERED_JOB_CONDITION_SQL} AS dead_lettered,(COALESCE(btrim(ig_handle),'') <> '') AS instagram_provided FROM audit_jobs WHERE id=$1`, [id]);
        return rows[0] ?? null;
    }
};
export interface ScanStatus {
    id: string;
    status: string;
    processing_stage: string | null;
    share_slug: string | null;
    score_coverage: number | null;
    failure_correlation_id: string | null;
    module_results: unknown;
    module_scores: unknown;
    dead_lettered: boolean;
    /** F-15: whether a handle was given at start; the engine reads Instagram from nothing else. */
    instagram_provided?: boolean;
}
