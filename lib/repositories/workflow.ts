import "server-only";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getPool } from "../db/client";
export type Json = null | boolean | number | string | Json[] | {
    [key: string]: Json;
};
export interface CreateOutputVersionInput {
    actionId: string;
    actor: string | null;
    authorType: string;
    actionRunId: string | null;
    body: string;
    alt: string | null;
    meta: Json;
    baseVersionId: string | null;
}
export interface VersionResult {
    kind: "created" | "approved" | "already-approved" | "decided" | "already-decided";
    version_id: string;
    version_no: number;
    decision?: string;
}
export interface ExportResult {
    kind: "existing" | "exported";
    delivery_id: string;
    version_id: string;
    counted: boolean;
    state: string;
}
export type CompletionClaim = {
    status: "skipped" | "completed" | "busy";
} | {
    status: "claimed";
    token: string;
};
export interface UnlockInput {
    jobId: string;
    whatsapp: string | null;
    email: string | null;
    recoveryEmail: string | null;
    preferredContactChannel: string | null;
    contactIdentifier: string | null;
    businessObjective: string | null;
    reportDeliveryConsent: boolean;
    scanDiscussionConsent: boolean;
    marketingConsent: boolean;
    policyVersion: string;
    locale: string;
    tokenHash: string;
    idempotencyKey: string;
    purpose: string;
    expiresAt: Date | string;
    anonymousSessionId: string;
    eventProperties: Json;
}
export interface UnlockResult {
    lead_id: string;
    grant_id: string;
    event_created: boolean;
}
export interface RateLimitResult {
    allowed: boolean;
    retry_after_seconds: number;
}
export interface AuditJobRow {
    id: string;
    workspace_id: string | null;
    business_name: string;
    ig_handle: string | null;
    website_url: string | null;
    industry: string | null;
    district: string | null;
    user_role: string | null;
    status: string;
    raw_payload: Json | null;
    overall_score: string | null;
    module_scores: Json | null;
    share_slug: string | null;
    unlocked: boolean | null;
    created_at: Date | null;
    completed_at: Date | null;
    raw_data: Json | null;
    summary_en: string | null;
    summary_zh: string | null;
    summary_tw: string | null;
    region: string;
    processing_stage: string | null;
    module_results: Json | null;
    score_coverage: string | null;
    scoring_version: string | null;
    input_snapshot: Json | null;
    failure_category: string | null;
    failure_correlation_id: string | null;
    attempt_count: number;
    last_attempt_at: Date | null;
    business_objective: string | null;
    place_id: string | null;
    place_match_confidence: string | null;
    parent_job_id: string | null;
    location_id: string | null;
}
type Executor = Pick<Pool | PoolClient, "query">;
/** Atomic domain operations preserve SQL errors. Pass the transaction callback client for fenced writes. */
export function workflowRepository(client: Executor = getPool()) {
    async function one<T extends QueryResultRow>(sql: string, values: unknown[]): Promise<T> {
        const result = await client.query<T>(sql, values);
        if (result.rows.length !== 1)
            throw new Error("workflow_cardinality_expected_one");
        return result.rows[0];
    }
    async function value<T>(sql: string, values: unknown[]): Promise<T> { return (await one<{
        value: T;
    }>(sql, values)).value; }
    return {
        createOutputVersion: (p: CreateOutputVersionInput) => value<VersionResult>("SELECT public.create_output_version($1,$2,$3,$4,$5,$6,$7,$8) AS value", [p.actionId, p.actor, p.authorType, p.actionRunId, p.body, p.alt, p.meta === null ? null : JSON.stringify(p.meta), p.baseVersionId]),
        approveOutputVersion: (id: string, actor: string | null, comment: string | null) => value<VersionResult>("SELECT public.approve_output_version($1,$2,$3) AS value", [id, actor, comment]),
        decideOutputVersion: (id: string, actor: string | null, decision: string, comment: string | null) => value<VersionResult>("SELECT public.decide_output_version($1,$2,$3,$4) AS value", [id, actor, decision, comment]),
        exportOutputVersion: (id: string, actor: string | null, mode: string, key: string) => value<ExportResult>("SELECT public.export_output_version($1,$2,$3,$4) AS value", [id, actor, mode, key]),
        async claimAuditJob(id: string): Promise<AuditJobRow | null> {
            const { rows } = await client.query<AuditJobRow>("SELECT * FROM public.claim_audit_job($1)", [id]);
            if (rows.length > 1)
                throw new Error("workflow_cardinality_expected_zero_or_one");
            return rows[0] ?? null;
        },
        claimWorkspaceCompletion: (id: string) => value<CompletionClaim>("SELECT public.claim_workspace_completion($1) AS value", [id]),
        finishWorkspaceCompletion: (id: string, token: string, succeeded: boolean, error: string | null) => value<boolean>("SELECT public.finish_workspace_completion($1,$2,$3,$4) AS value", [id, token, succeeded, error]),
        async pendingWorkspaceCompletions(limit?: number): Promise<Array<{
            job_id: string;
        }>> {
            return (await client.query<{
                job_id: string;
            }>(limit === undefined ? "SELECT * FROM public.pending_workspace_completions()" : "SELECT * FROM public.pending_workspace_completions($1)", limit === undefined ? [] : [limit])).rows;
        },
        consumeRateLimit: (key: string, limit: number, window: number) => one<RateLimitResult>("SELECT * FROM public.consume_rate_limit($1,$2,$3)", [key, limit, window]),
        completeReportUnlock: (p: UnlockInput) => one<UnlockResult>("SELECT * FROM public.complete_report_unlock($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)", [p.jobId, p.whatsapp, p.email, p.recoveryEmail, p.preferredContactChannel, p.contactIdentifier, p.businessObjective, p.reportDeliveryConsent, p.scanDiscussionConsent, p.marketingConsent, p.policyVersion, p.locale, p.tokenHash, p.idempotencyKey, p.purpose, p.expiresAt, p.anonymousSessionId, p.eventProperties === null ? null : JSON.stringify(p.eventProperties)]),
    };
}
export type WorkflowRepository = ReturnType<typeof workflowRepository>;
