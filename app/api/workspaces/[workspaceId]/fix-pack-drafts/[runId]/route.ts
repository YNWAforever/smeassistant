import { NextResponse } from "next/server";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/admin";

/**
 * Owner/manager approve or reject a pending Fix Pack draft -- the "may
 * approve" half of the roadmap's approve-vs-view permission row (viewers get
 * the GET sibling only). Staff keep their own PATCH
 * /api/staff/agent-runs/[runId] in the legacy console as the managed-service
 * variant; two routes, two trust models, never one route with dual
 * authorization (the owner-callback precedent).
 *
 * No editedOutput here, deliberately: merchant-side editing is out of scope
 * (design doc Non-goals) -- a merchant unhappy with a draft rejects it.
 *
 * The update is conditional on status='draft': this route only ever moves a
 * draft OUT of pending, so a double-click race or a staff review that landed
 * moments earlier answers 409 rather than silently overwriting the earlier
 * reviewer -- unlike the staff route, whose re-review ability is kept as its
 * rescind mechanism.
 *
 * Ported from upstream's /api/owner/workspaces/[workspaceId]/fix-pack-drafts/[runId].
 * Authorization goes through authorizeWorkspaceRequest with minRole
 * "manager" (§3.9; staff sessions never accepted).
 */
const UUID_RE = /^[0-9a-f-]{36}$/i;
const VALID_STATUSES = new Set(["approved", "rejected"]);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ workspaceId: string; runId: string }> },
) {
  const { workspaceId, runId } = await params;
  if (!UUID_RE.test(workspaceId)) {
    return NextResponse.json({ error: "workspaceId is invalid" }, { status: 400 });
  }
  if (!UUID_RE.test(runId)) {
    return NextResponse.json({ error: "runId is invalid" }, { status: 400 });
  }

  const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "manager" });
  if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });

  let body: { status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const status = typeof body.status === "string" && VALID_STATUSES.has(body.status) ? body.status : null;
  if (!status) {
    return NextResponse.json({ error: "status must be approved or rejected" }, { status: 400 });
  }

  const supabase = supabaseServer();

  // Workspace scoping: the run's job must belong to the path's workspace. A
  // run from another workspace answers the same 404 as a nonexistent run, so
  // this cannot be used to probe which run ids exist.
  const { data: run } = await supabase
    .from("agent_runs")
    .select("job_id, audit_jobs!inner(workspace_id)")
    .eq("id", runId)
    .maybeSingle();
  const runWorkspaceId = (run as { audit_jobs?: { workspace_id?: string } } | null)?.audit_jobs?.workspace_id;
  if (!run || runWorkspaceId !== workspaceId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: updated, error } = await supabase
    .from("agent_runs")
    .update({ status, reviewed_by: auth.user.id, reviewed_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "draft")
    .select("id");
  if (error) {
    console.error("[owner/fix-pack-drafts] review failed", { category: "fix_pack_review_failed" });
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
  if (!updated?.length) {
    // Zero rows: the conditional .eq("status", "draft") matched nothing --
    // someone (this user double-clicking, another manager, or staff) already
    // reviewed it.
    return NextResponse.json({ error: "already reviewed" }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
