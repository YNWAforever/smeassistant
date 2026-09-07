import "server-only";
import type { ViewerGrantRecord } from "@/lib/report-access/authorize-report";
import { reportsRepository } from "@/lib/repositories/reports";
import type { Pool } from "pg";
import type { ModuleResultRow } from "@sme-scanner/contracts";
import type { SummaryColumn } from "./executive-summary";

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
  completed_at: string | null;
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

export function createReportStore(client?: Pick<Pool,"query">): ReportStore { return reportsRepository(client); }
