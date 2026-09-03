import "server-only";
import type { ViewerGrantRecord } from "@/lib/report-access/authorize-report";
import { supabaseServer } from "@/lib/supabase/admin";
import type { ModuleResultRow } from "@sme-scanner/contracts";
import type { SummaryColumn } from "./executive-summary";

// workspace_id is added to upstream's list so authorizeReport can cross-check a
// workspace membership against the job's own workspace (fail closed, guardrail 9).
const PUBLIC_JOB_COLUMNS = "id, share_slug, business_name, district, industry, status, overall_score, module_scores, module_results, score_coverage, region, scoring_version, workspace_id";
const AUTHORIZED_JOB_COLUMNS = "raw_data, summary_zh, summary_en, summary_tw";
const PUBLIC_FINDING_COLUMNS = "id, job_id, module, finding_key, severity, score_impact";
const AUTHORIZED_FINDING_COLUMNS = "id, job_id, module, finding_key, severity, score_impact, owner_message_zh, owner_message_en, owner_message_tw, owner_action_zh, owner_action_en, evidence, v02_agent_hint";
const VIEWER_GRANT_COLUMNS = "id, job_id, token_hash, expires_at, redeemed_at, revoked_at, last_used_at";
const APPROVED_AGENT_RUN_COLUMNS = "finding_key, agent_key, output";

export interface PublicReportJob {
  id: string;
  share_slug: string;
  business_name: string;
  district: string | null;
  industry: string | null;
  status: string;
  overall_score: number | null;
  module_scores: Record<string, { score: number | null }> | null;
  module_results: Record<string, ModuleResultRow> | null;
  score_coverage: number | null;
  region: string | null;
  scoring_version: string | null;
  /** `audit_jobs.workspace_id`; null until the job is attached to a workspace. */
  workspace_id?: string | null;
}

export interface AuthorizedJobData {
  raw_data: unknown;
  summary_zh: string | null;
  summary_en: string | null;
  summary_tw: string | null;
}

export interface LoadedAuthorizedFinding {
  id: string;
  job_id: string;
  module: string;
  finding_key: string;
  severity: string;
  score_impact: number | null;
  owner_message_zh?: string | null;
  owner_message_en?: string | null;
  owner_message_tw?: string | null;
  owner_action_zh?: string | null;
  owner_action_en?: string | null;
  evidence?: Record<string, unknown> | null;
  v02_agent_hint?: string | null;
}

export interface ApprovedAgentRun {
  findingKey: string;
  agentKey: string;
  output: Record<string, unknown>;
}

type LoadedPublicFinding = Pick<
  LoadedAuthorizedFinding,
  "id" | "job_id" | "module" | "finding_key" | "severity" | "score_impact"
>;

export interface LoadedPublicFindings {
  findings: LoadedPublicFinding[];
  count: number;
}

export interface ReportStore {
  readPublicJobBySlug(slug: string): Promise<PublicReportJob | null>;
  readPublicFindings(jobId: string): Promise<LoadedPublicFindings>;
  readAuthorizedJobData(jobId: string): Promise<AuthorizedJobData>;
  readAuthorizedFindings(jobId: string): Promise<LoadedAuthorizedFinding[]>;
  readApprovedAgentRuns(jobId: string): Promise<ApprovedAgentRun[]>;
  findViewerGrant(jobId: string, grantId: string): Promise<ViewerGrantRecord | null>;
  markViewerGrantUsed(jobId: string, grantId: string): Promise<void>;
  cacheSummary(jobId: string, column: SummaryColumn, value: string): Promise<void>;
}

function queryError(message: string, error: unknown): Error {
  const detail =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "unknown database error";
  return new Error(`${message}: ${detail}`);
}

function missingRow(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "PGRST116");
}

export function createReportStore(
  client: ReturnType<typeof supabaseServer> = supabaseServer(),
): ReportStore {
  return {
    async readPublicJobBySlug(slug) {
      const result = await client.from("audit_jobs").select(PUBLIC_JOB_COLUMNS).eq("share_slug", slug).single();
      if (result.error) {
        if (missingRow(result.error)) return null;
        throw queryError("Unable to load report job", result.error);
      }
      return (result.data ?? null) as PublicReportJob | null;
    },

    async readPublicFindings(jobId) {
      const [findingsResult, countResult] = await Promise.all([
        client.from("audit_findings").select(PUBLIC_FINDING_COLUMNS).eq("job_id", jobId).order("score_impact", { ascending: true }).limit(12),
        client.from("audit_findings").select("id", { count: "exact", head: true }).eq("job_id", jobId),
      ]);

      if (findingsResult.error) {
        throw queryError("Unable to load public report findings", findingsResult.error);
      }
      if (countResult.error) {
        throw queryError("Unable to count public report findings", countResult.error);
      }

      const findings = (findingsResult.data ?? []) as LoadedPublicFinding[];
      return { findings, count: countResult.count ?? findings.length };
    },

    async readAuthorizedJobData(jobId) {
      const result = await client.from("audit_jobs").select(AUTHORIZED_JOB_COLUMNS).eq("id", jobId).single();
      if (result.error || !result.data) {
        throw queryError("Unable to load authorized report proof", result.error ?? new Error("authorized job row missing"));
      }
      return result.data as AuthorizedJobData;
    },

    async readAuthorizedFindings(jobId) {
      const result = await client.from("audit_findings").select(AUTHORIZED_FINDING_COLUMNS).eq("job_id", jobId).order("score_impact", { ascending: true });
      if (result.error) {
        throw queryError("Unable to load authorized report findings", result.error);
      }
      return (result.data ?? []) as LoadedAuthorizedFinding[];
    },

    async readApprovedAgentRuns(jobId) {
      const result = await client
        .from("agent_runs")
        .select(APPROVED_AGENT_RUN_COLUMNS)
        .eq("job_id", jobId)
        .eq("status", "approved");
      if (result.error) {
        throw queryError("Unable to load approved agent runs", result.error);
      }
      return ((result.data ?? []) as Array<{ finding_key: string; agent_key: string; output: Record<string, unknown> }>).map(
        (row) => ({ findingKey: row.finding_key, agentKey: row.agent_key, output: row.output }),
      );
    },

    async findViewerGrant(jobId, grantId) {
      const result = await client
        .from("report_access_grants")
        .select(VIEWER_GRANT_COLUMNS)
        .eq("id", grantId)
        .eq("job_id", jobId)
        .single();

      if (result.error) {
        if (missingRow(result.error)) return null;
        throw queryError("Unable to load report access grant", result.error);
      }
      return (result.data ?? null) as ViewerGrantRecord | null;
    },

    async markViewerGrantUsed(jobId, grantId) {
      const result = await client
        .from("report_access_grants")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", grantId)
        .eq("job_id", jobId)
        .is("revoked_at", null);

      if (result.error) {
        throw queryError("Unable to update report access grant usage", result.error);
      }
    },

    async cacheSummary(jobId, column, value) {
      const result = await client.from("audit_jobs").update({ [column]: value }).eq("id", jobId);
      if (result.error) {
        throw queryError("Unable to cache report summary", result.error);
      }
    },
  };
}
