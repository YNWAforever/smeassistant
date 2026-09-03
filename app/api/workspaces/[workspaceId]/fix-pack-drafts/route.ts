import { NextResponse } from "next/server";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { supabaseServer } from "@/lib/supabase/admin";
import { resolveFindingLabel } from "@/lib/report/finding-label";
import { resolveFixPackDraftText } from "@/lib/report/view-model";

/**
 * Lists a workspace's Fix Pack drafts (pending + approved) for the owner
 * home's FixPackCard. Any accepted member may view -- this is the "may
 * view" half of the roadmap's approve-vs-view permission row; the PATCH
 * sibling is the "may approve" half. Rejected drafts are omitted: they are
 * reviewer workflow, not merchant-facing content.
 *
 * Rows are display-ready -- the finding label and per-agent draft text are
 * resolved server-side (same findingMessageKey/readableFindingKey fallback
 * the report page uses, same resolveFixPackDraftText the report page renders
 * with), so raw agent_runs.output never ships to the client. For review
 * replies, the reviewed excerpt and rating ship too -- an approver cannot
 * judge a reply without the review it answers; both are the workspace's own
 * public review content, and both are null for gbp_post_agent rows (a post
 * answers nothing).
 *
 * Ported from upstream's /api/owner/workspaces/[workspaceId]/fix-pack-drafts.
 * Authorization goes through authorizeWorkspaceRequest (any member; staff
 * sessions never accepted) and labels resolve through this app's message
 * bundles (lib/i18n) instead of next-intl.
 */
const WORKSPACE_ID_RE = /^[0-9a-f-]{36}$/i;
const LOCALES = new Set(["en", "zh-HK", "zh-TW"]);

interface DraftRow {
  id: string;
  job_id: string;
  finding_key: string;
  agent_key: string;
  status: string;
  output: Record<string, unknown> | null;
  created_at: string;
  audit_jobs: { workspace_id: string; business_name: string | null } | null;
}

export async function GET(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  if (!WORKSPACE_ID_RE.test(workspaceId)) {
    return NextResponse.json({ error: "workspaceId is invalid" }, { status: 400 });
  }
  const locale = new URL(req.url).searchParams.get("locale") ?? "";
  if (!LOCALES.has(locale)) {
    return NextResponse.json({ error: "locale is invalid" }, { status: 400 });
  }

  // All three roles may view -- approval rights are enforced on the PATCH
  // sibling, not here.
  const auth = await authorizeWorkspaceRequest({ id: workspaceId });
  if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });

  const supabase = supabaseServer();
  const { data: rows, error } = await supabase
    .from("agent_runs")
    .select("id, job_id, finding_key, agent_key, status, output, created_at, audit_jobs!inner(workspace_id, business_name)")
    .eq("audit_jobs.workspace_id", workspaceId)
    .in("status", ["draft", "approved"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("[owner/fix-pack-drafts] list failed", { category: "fix_pack_list_failed" });
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }

  const translate = (key: string) => t(locale, `report.${key}`);
  const drafts = ((rows ?? []) as unknown as DraftRow[]).map((row) => ({
    id: row.id,
    jobId: row.job_id,
    businessName: row.audit_jobs?.business_name ?? null,
    findingLabel: resolveFindingLabel(translate, row.finding_key),
    agentKey: row.agent_key,
    status: row.status,
    draftText: resolveFixPackDraftText(row.output, locale),
    reviewExcerpt:
      row.agent_key === "review_reply_agent" && typeof row.output?.reviewExcerpt === "string"
        ? row.output.reviewExcerpt
        : null,
    reviewRating:
      row.agent_key === "review_reply_agent" && typeof row.output?.reviewRating === "number"
        ? row.output.reviewRating
        : null,
    createdAt: row.created_at,
  }));

  return NextResponse.json({ drafts });
}
