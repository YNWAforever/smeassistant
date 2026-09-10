import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { getPool } from "../db/client";
import { withTransaction } from "../db/transaction";
import { auditJobs } from "../db/schema/jobs";
import type { buildScanConsentInsert, buildScanJobInsert } from "../scan/start-job";
export interface JobsRepository {
    insert(row: ReturnType<typeof buildScanJobInsert>, consent: ReturnType<typeof buildScanConsentInsert>): Promise<{
        id: string;
    }>;
}
export const jobsRepository: JobsRepository & {
    readStatus(id: string): Promise<ScanStatus | null>;
    readScanConsent(jobId: string): Promise<{ granted: boolean; policy_version: string } | null>;
    failQueued(jobId: string, category: string, correlationId: string): Promise<boolean>;
} = {
    /**
     * The job and its scan-time consent are one transaction: consent_records.job_id
     * is NOT NULL, so the consent row can only be written after the job exists, and
     * writing them separately would leave a window where a queued job has no
     * consent. A failure in either statement rolls both back.
     */
    async insert(row, consent) {
        return withTransaction(async (client) => {
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
     */
    async failQueued(jobId, category, correlationId) {
        const { rows } = await getPool().query<{ id: string }>(
            "UPDATE audit_jobs SET status='failed',processing_stage='failed',failure_category=$2,failure_correlation_id=$3,completed_at=now() WHERE id=$1 AND status='queued' RETURNING id",
            [jobId, category, correlationId],
        );
        return rows.length > 0;
    },
    async readStatus(id) {
        const { rows } = await getPool().query<ScanStatus>("SELECT id,status,processing_stage,share_slug,score_coverage::float8 AS score_coverage,failure_correlation_id,module_results,module_scores FROM audit_jobs WHERE id=$1", [id]);
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
}
