import { unstable_noStore as noStore } from "next/cache";
import { after } from "next/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  authorizeReport,
  type ReportWorkspaceMembership,
  type StaffSessionUser,
} from "@/lib/report-access/authorize-report";
import { VIEWER_GRANT_COOKIE, parseViewerGrantCookie } from "@/lib/report-access/cookie";
import type { PresentedViewerToken } from "@/lib/report-access/token";
import { loadStaffSessionUser } from "@/lib/report-access/staff-session";
import { loadAuthorizedEvidence } from "@/lib/evidence/load-authorized";
import { sanitizeReportProof } from "./sanitize-proof";
import {
  buildReportViewModel,
  type AuthorizedReportSource,
  type ReportViewModel,
  type ReportViewSource,
} from "./view-model";
import { createReportStore, type ApprovedAgentRun, type LoadedAuthorizedFinding, type PublicReportJob, type ReportStore } from "./store";
import { createReportLanguageService, type ReportLanguageService } from "./language-service";

type LoadedJob = PublicReportJob;
type LoadedFinding = LoadedAuthorizedFinding;
type SummaryCacheWork = (() => Promise<void>) & {
  column?: "summary_zh" | "summary_en" | "summary_tw";
};
const MODULES = ["ig", "gbp", "aeo", "trust"] as const;
function moduleResults(job: LoadedJob): ReportViewSource["job"]["moduleResults"] {
  return Object.fromEntries(MODULES.map((module) => {
    const result = job.module_results?.[module];
    if (result) return [module, { status: result.status, score: result.status === "measured" ? result.score : null,
      confidence: result.confidence, limitationCode: result.limitationCode }];
    const legacyScore = job.module_scores?.[module]?.score;
    if (typeof legacyScore === "number") return [module, { status: "measured" as const, score: legacyScore, confidence: "low" as const, limitationCode: null }];
    return [module, { status: "unavailable" as const, score: null, confidence: "none" as const, limitationCode: `${module.toUpperCase()}_NOT_MEASURED` }];
  }));
}
function localizedMessage(finding: LoadedFinding, locale: string): string | null {
  if (locale === "en") return finding.owner_message_en ?? finding.owner_message_zh ?? null;
  if (locale === "zh-TW") return finding.owner_message_tw ?? finding.owner_message_zh ?? null;
  return finding.owner_message_zh ?? null;
}
function localizedAction(finding: LoadedFinding, locale: string): string | null {
  return locale === "en" ? finding.owner_action_en ?? finding.owner_action_zh ?? null : finding.owner_action_zh ?? null;
}
function sourceFor(job: LoadedJob, findings: LoadedFinding[], findingCount: number, locale: string, includeDetail: boolean,
  authorized?: AuthorizedReportSource, agentRuns: ApprovedAgentRun[] = []): ReportViewSource {
  return {
    job: { id: job.id, slug: job.share_slug, locale, region: job.region ?? "hk", businessName: job.business_name,
      district: job.district ?? null, industry: job.industry ?? null, status: job.status,
      overallScore: job.overall_score, scoreCoverage: job.score_coverage, moduleResults: moduleResults(job) },
    findingCount,
    findings: findings.map((finding) => ({
      id: finding.id, findingKey: finding.finding_key, module: finding.module, severity: finding.severity, scoreImpact: finding.score_impact,
      ownerMessage: includeDetail ? localizedMessage(finding, locale) : null,
      detailedFix: includeDetail ? localizedAction(finding, locale) : null,
      evidence: includeDetail ? finding.evidence ?? null : null,
      internalHint: includeDetail ? finding.v02_agent_hint ?? null : null,
      fixPackDraftOutput: includeDetail
        ? agentRuns.find((run) => run.findingKey === finding.finding_key)?.output ?? null
        : null,
    })),
    authorized,
  };
}

/** The job facts a membership resolver may need: its id and the workspace it is attached to. */
export interface ReportMembershipJob {
  id: string;
  workspaceId: string | null;
}

/** Load one fresh, authorized report model. Personalized report data is never cached. */
export interface ReportLoaderDependencies {
  store: ReportStore;
  languageService: ReportLanguageService;
  loadEvidence: (jobId: string) => ReturnType<typeof loadAuthorizedEvidence>;
  getViewerToken: () => Promise<PresentedViewerToken | null>;
  getStaffUser: () => Promise<StaffSessionUser | null>;
  /**
   * Accepted workspace membership of the signed-in user on the job's workspace
   * (CLAUDE.md 3.2.2 `member` access). Optional; the default resolves null so a
   * caller without a session layer (Phase 1) gets upstream's behaviour. A
   * zero-argument resolver is accepted too. `authorizeReport` still rejects a
   * membership that does not name the job's own workspace.
   */
  getMembership?: (job: ReportMembershipJob) => Promise<ReportWorkspaceMembership | null>;
  scheduleAfter: (work: () => Promise<void>) => void;
}

const noMembership = async (): Promise<ReportWorkspaceMembership | null> => null;

export function createReportLoader(
  deps: ReportLoaderDependencies,
): (shareSlug: string, locale: string) => Promise<ReportViewModel> {
  const getMembership = deps.getMembership ?? noMembership;
  return async (shareSlug: string, locale: string) => {
    const job = await deps.store.readPublicJobBySlug(shareSlug);
    if (!job) notFound();

    const access = await authorizeReport({
      // Normalise the column before authorizing. authorizeReport lets a caller vouch
      // for scope when the job row carries no workspace_id at all; the loader always
      // selects that column (PUBLIC_JOB_COLUMNS), so an unattached job must present
      // as an explicit null and fail closed instead of trusting the membership.
      job: { ...job, workspace_id: job.workspace_id ?? null },
      viewerToken: await deps.getViewerToken(),
      staffUser: await deps.getStaffUser(),
      workspaceMembership: await getMembership({ id: job.id, workspaceId: job.workspace_id ?? null }),
      lookupGrant: (grantId) => deps.store.findViewerGrant(job.id, grantId),
      markUsed: (grantId) => deps.store.markViewerGrantUsed(job.id, grantId),
    });

    if (access.kind === "public") {
      const publicData = await deps.store.readPublicFindings(job.id);
      return buildReportViewModel(
        sourceFor(job, publicData.findings, publicData.count, locale, false),
        access,
      );
    }

    const [authorizedJob, findings, evidence, agentRuns] = await Promise.all([
      deps.store.readAuthorizedJobData(job.id),
      deps.store.readAuthorizedFindings(job.id),
      deps.loadEvidence(job.id),
      deps.store.readApprovedAgentRuns(job.id),
    ]);
    const summary = await deps.languageService.resolveSummary(
      {
        jobId: job.id,
        businessName: job.business_name,
        industry: job.industry,
        district: job.district,
        overallScore: job.overall_score,
        cached: authorizedJob,
        findings,
      },
      locale,
      (jobId, column, value) => {
        const work: SummaryCacheWork = Object.assign(
          () => deps.store.cacheSummary(jobId, column, value),
          { column },
        );
        deps.scheduleAfter(work);
      },
    );
    const authorized: AuthorizedReportSource = {
      summary,
      proof: sanitizeReportProof(authorizedJob.raw_data, findings),
      evidence,
    };
    return buildReportViewModel(
      sourceFor(job, findings, findings.length, locale, true, authorized, agentRuns),
      access,
    );
  };
}

export interface LoadReportOptions {
  /** Membership resolver from the session layer (Phase 2 `lib/auth.ts`); omitted = no member access. */
  getMembership?: ReportLoaderDependencies["getMembership"];
}

export async function loadReport(
  shareSlug: string,
  locale = "en",
  options: LoadReportOptions = {},
): Promise<ReportViewModel> {
  noStore();
  const cookieStore = await cookies();
  const load = createReportLoader({
    store: createReportStore(),
    languageService: createReportLanguageService(),
    loadEvidence: loadAuthorizedEvidence,
    getViewerToken: async () =>
      parseViewerGrantCookie(cookieStore.get(VIEWER_GRANT_COOKIE)?.value),
    getStaffUser: loadStaffSessionUser,
    getMembership: options.getMembership,
    scheduleAfter: (work) => {
      const column = (work as SummaryCacheWork).column;
      after(async () => {
        try {
          await work();
        } catch {
          // A failed cache write costs one regeneration on the next view. It
          // must never surface as a report error.
          console.error("[report] summary cache write failed", { column });
        }
      });
    },
  });
  return load(shareSlug, locale);
}
