import { NextResponse } from "next/server";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { supabaseServer } from "@/lib/supabase/admin";
import { ipHashFor } from "@/lib/workspace/audit";
import { isWorkspacePaid } from "@/lib/workspace/entitlement";
import { enqueueRescan, ensureMonthlySchedule } from "@/lib/workspace/rescan";

/**
 * POST /api/workspaces/[workspaceId]/rescan { locationId } → 201 { jobId }
 * (CLAUDE.md §3.2.3, Phase 6 item 1). Owner or manager-in-scope (§3.9);
 * paid tier only (403 tier_required); 3 per day per *workspace* (429); 404
 * when the location has no finished scan to rebuild from. The client then
 * POSTs /api/scan/process { jobId } exactly like the public funnel.
 *
 * Order matters: authorization, then the tier gate, then the limiter — an
 * unauthenticated or lite caller must not burn the workspace's daily budget.
 * The monthly schedule is created after the job (paid only, once per
 * placeId); a refusal there is logged and never fails the rescan.
 */
const WORKSPACE_ID_RE = /^[0-9a-f-]{36}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  if (!WORKSPACE_ID_RE.test(workspaceId)) {
    return NextResponse.json({ error: "workspaceId is invalid" }, { status: 400 });
  }

  let body: { locationId?: unknown; locale?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const locationId = typeof body?.locationId === "string" && UUID_RE.test(body.locationId) ? body.locationId : null;
  if (!locationId) return NextResponse.json({ error: "locationId is invalid" }, { status: 400 });

  const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "manager", locationId });
  if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });

  const db = supabaseServer();
  const { data: workspace, error: workspaceError } = await db.from("workspaces").select("tier").eq("id", workspaceId).maybeSingle<{ tier: string | null }>();
  if (workspaceError) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (!isWorkspacePaid(workspace?.tier)) return NextResponse.json({ error: "tier_required" }, { status: 403 });

  const decision = await enforceRateLimit({ req, scope: "rescan", identifiers: [workspaceId], failClosed: true });
  if (!decision.allowed) return rateLimitedResponse(decision.retryAfterSeconds);

  const rawLocale = typeof body.locale === "string" ? body.locale : req.headers.get("x-sme-locale") ?? "";
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const now = new Date();

  let result: Awaited<ReturnType<typeof enqueueRescan>>;
  try {
    result = await enqueueRescan(db, { workspaceId, locationId, actorId: auth.user.id, now, locale, ipHash: ipHashFor(req) });
  } catch {
    console.error("[api/workspaces/rescan] failed", { category: "rescan_failed" });
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if (!result.ok) {
    if (result.reason === "no_finished_job") return NextResponse.json({ error: "no_finished_scan" }, { status: 404 });
    if (result.reason === "snapshot_not_v2") return NextResponse.json({ error: "snapshot_not_rescannable" }, { status: 409 });
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  try {
    const schedule = await ensureMonthlySchedule(db, { job: result.sourceJob, workspaceId, actorId: auth.user.id, nowIso: now.toISOString() });
    if (!schedule.created && schedule.reason !== "exists") {
      console.warn("[api/workspaces/rescan] monthly schedule not created", { category: "rescan_schedule_refused", reason: schedule.reason });
    }
  } catch {
    console.error("[api/workspaces/rescan] monthly schedule failed", { category: "rescan_schedule_failed" });
  }

  return NextResponse.json({ jobId: result.jobId }, { status: 201 });
}
