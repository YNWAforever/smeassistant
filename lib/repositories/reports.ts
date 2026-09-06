import "server-only";
import type { Pool, QueryResultRow } from "pg";
import { getPool } from "../db/client";
import type { ReportStore, PublicReportJob, AuthorizedJobData, LoadedAuthorizedFinding } from "../report/store";
import type { ViewerGrantRecord } from "../report-access/authorize-report";
export function reportsRepository(client?: Pick<Pool, "query">): ReportStore & {
    revokeViewerGrant(grantId: string, tokenHash: string): Promise<void>;
    readUnlockJob(slug: string): Promise<{
        id: string;
        share_slug: string;
        region: string;
        business_objective: string | null;
    } | null>;
    readShareCard(slug: string): Promise<Pick<PublicReportJob, "business_name" | "overall_score" | "module_scores"> | null>;
} {
    async function rows<T extends QueryResultRow>(sql: string, values: unknown[]): Promise<T[]> {
        try {
            return (await (client ?? getPool()).query<T>(sql, values)).rows;
        }
        catch {
            throw new Error("report_persistence_unavailable");
        }
    }
    const publicColumns = "id,share_slug,business_name,district,industry,status,overall_score::float8 AS overall_score,module_scores,module_results,score_coverage::float8 AS score_coverage,region,scoring_version,workspace_id";
    const findingColumns = "id,job_id,module,finding_key,severity,score_impact::float8 AS score_impact";
    return {
        async readPublicJobBySlug(slug) { return (await rows<PublicReportJob>(`SELECT ${publicColumns} FROM audit_jobs WHERE share_slug=$1`, [slug]))[0] ?? null; },
        async readPublicFindings(jobId) {
            const [findings, count] = await Promise.all([rows<LoadedAuthorizedFinding>(`SELECT ${findingColumns} FROM audit_findings WHERE job_id=$1 ORDER BY score_impact ASC NULLS LAST LIMIT 12`, [jobId]), rows<{
                    count: number;
                }>("SELECT count(*)::int AS count FROM audit_findings WHERE job_id=$1", [jobId])]);
            return { findings, count: count[0].count };
        },
        async readAuthorizedJobData(jobId) {
            const row = (await rows<AuthorizedJobData>("SELECT raw_data,summary_zh,summary_en,summary_tw FROM audit_jobs WHERE id=$1", [jobId]))[0];
            if (!row)
                throw new Error("authorized_report_missing");
            return row;
        },
        readAuthorizedFindings: jobId => rows<LoadedAuthorizedFinding>(`SELECT ${findingColumns},owner_message_zh,owner_message_en,owner_message_tw,owner_action_zh,owner_action_en,evidence,v02_agent_hint FROM audit_findings WHERE job_id=$1 ORDER BY score_impact ASC NULLS LAST`, [jobId]),
        async readApprovedAgentRuns(jobId) {
            return (await rows<{
                finding_key: string;
                agent_key: string;
                output: Record<string, unknown>;
            }>("SELECT finding_key,agent_key,output FROM agent_runs WHERE job_id=$1 AND status='approved'", [jobId])).map(row => ({ findingKey: row.finding_key, agentKey: row.agent_key, output: row.output }));
        },
        async findViewerGrant(jobId, grantId) {
            return (await rows<ViewerGrantRecord>("SELECT id,job_id,token_hash,expires_at::text,redeemed_at::text,revoked_at::text,last_used_at::text FROM report_access_grants WHERE id=$1 AND job_id=$2", [grantId, jobId]))[0] ?? null;
        },
        async revokeViewerGrant(grantId, tokenHash) {
            await rows("UPDATE report_access_grants SET revoked_at=now() WHERE id=$1 AND token_hash=$2 AND revoked_at IS NULL", [grantId, tokenHash]);
        },
        async markViewerGrantUsed(jobId, grantId) { await rows("UPDATE report_access_grants SET last_used_at=now() WHERE id=$1 AND job_id=$2 AND revoked_at IS NULL", [grantId, jobId]); },
        async cacheSummary(jobId, column, value) {
            const statements = { summary_zh: "UPDATE audit_jobs SET summary_zh=$2 WHERE id=$1", summary_en: "UPDATE audit_jobs SET summary_en=$2 WHERE id=$1", summary_tw: "UPDATE audit_jobs SET summary_tw=$2 WHERE id=$1" };
            if (!Object.hasOwn(statements, column))
                throw new Error("invalid_summary_column");
            await rows(statements[column], [jobId, value]);
        },
        async readUnlockJob(slug) { return (await rows<{
            id: string;
            share_slug: string;
            region: string;
            business_objective: string | null;
        }>("SELECT id,share_slug,region,business_objective FROM audit_jobs WHERE share_slug=$1", [slug]))[0] ?? null; },
        async readShareCard(slug) { return (await rows<Pick<PublicReportJob, "business_name" | "overall_score" | "module_scores">>("SELECT business_name,overall_score::float8 AS overall_score,module_scores FROM audit_jobs WHERE share_slug=$1", [slug]))[0] ?? null; },
    };
}
