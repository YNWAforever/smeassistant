import { NextResponse } from "next/server";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { rescanRepository } from "@/lib/repositories/rescan";
import { ipHashFor } from "@/lib/workspace/audit";
import { isWorkspacePaid } from "@/lib/workspace/entitlement";
import { parseScanConsent } from "@/lib/scan/consent";
import { enqueueRescan, ensureMonthlySchedule } from "@/lib/workspace/rescan";

/**
 * POST /api/workspaces/[workspaceId]/rescan { locationId } → 201 { jobId }
 * (CLAUDE.md §3.2.3, Phase 6 item 1). Owner or manager-in-scope (§3.9);
 * paid tier only (403 tier_required); 3 per day per *workspace* (429); 404
 * when the location has no finished scan to rebuild from. The client then
 * POSTs /api/scan/process { jobId } exactly like the public funnel.
 *
 * Order matters: body shape, then consent, then authorization, then the tier
 * gate, then the limiter — an unauthenticated or lite caller must not burn the
 * workspace's daily budget. Consent sits with body validation because it is
 * part of the request's shape, and refusing a malformed or stale one costs no
 * database read.
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

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const body: Record<string, unknown> = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const locationId = typeof body.locationId === "string" && UUID_RE.test(body.locationId) ? body.locationId : null;
  if (!locationId) return NextResponse.json({ error: "locationId is invalid" }, { status: 400 });

  // Locale is resolved before the consent because the consent record stores the
  // language the policy was shown in.
  const rawLocale = typeof body.locale === "string" ? body.locale : req.headers.get("x-sme-locale") ?? "";
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  // Parsed here, from the request, through the same contract the scan wizard
  // uses. enqueueRescan used to synthesise this itself -- granted:true stamped
  // with whatever version was published -- so a policy-versioned agreement was
  // recorded for an owner who had never been shown one. A submitted version
  // that no longer matches the published one is now refused (409) rather than
  // silently restamped.
  const consent = parseScanConsent(body, locale);
  if (!consent.ok) return NextResponse.json({ error: consent.error }, { status: consent.status });

  const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "manager", locationId });
  if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });

  const repo = rescanRepository();
  let tier: string | null;
  try { tier = await repo.tier(workspaceId); }
  catch { return NextResponse.json({ error: "unavailable" }, { status: 503 }); }
  if (!isWorkspacePaid(tier)) return NextResponse.json({ error: "tier_required" }, { status: 403 });

  const decision = await enforceRateLimit({ req, scope: "rescan", identifiers: [workspaceId], failClosed: true });
  if (!decision.allowed) return rateLimitedResponse(decision.retryAfterSeconds);

  const now = new Date();

  let result: Awaited<ReturnType<typeof enqueueRescan>>;
  try {
    result = await enqueueRescan(repo, { workspaceId, locationId, actorId: auth.user.id, consent: consent.consent, now, locale, ipHash: ipHashFor(req) });
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
    const schedule = await ensureMonthlySchedule(repo, { job: result.sourceJob, workspaceId, actorId: auth.user.id, nowIso: now.toISOString() });
    if (!schedule.created && schedule.reason !== "exists") {
      console.warn("[api/workspaces/rescan] monthly schedule not created", { category: "rescan_schedule_refused", reason: schedule.reason });
    }
  } catch {
    console.error("[api/workspaces/rescan] monthly schedule failed", { category: "rescan_schedule_failed" });
  }

  return NextResponse.json({ jobId: result.jobId }, { status: 201 });
}
