import "server-only";
import { getDatabase, getPool } from "../db/client";
import { auditJobs } from "../db/schema/jobs";
import type { buildScanJobInsert } from "../scan/start-job";
export interface JobsRepository {
    insert(row: ReturnType<typeof buildScanJobInsert>): Promise<{
        id: string;
    }>;
}
export const jobsRepository: JobsRepository & {
    readStatus(id: string): Promise<ScanStatus | null>;
} = {
    async insert(row) {
        const values: typeof auditJobs.$inferInsert = {
            businessName: row.business_name, igHandle: row.ig_handle, websiteUrl: row.website_url,
            industry: row.industry, district: row.district, userRole: row.user_role, status: row.status,
            shareSlug: row.share_slug, region: row.region, businessObjective: row.business_objective,
            inputSnapshot: row.input_snapshot, placeId: row.place_id, placeMatchConfidence: row.place_match_confidence,
            parentJobId: row.parent_job_id, workspaceId: row.workspace_id, locationId: row.location_id,
        };
        const [created] = await getDatabase().insert(auditJobs).values(values).returning({ id: auditJobs.id });
        if (!created)
            throw new Error("scan_insert_missing");
        return created;
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
