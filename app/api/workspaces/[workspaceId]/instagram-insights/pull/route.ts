import { NextResponse } from "next/server";

import { authorizeWorkspaceRequest } from "@/lib/auth";
import { instagramInsightsEnabled } from "@/lib/publishing/flag";
import { consumeInstagramPublishLimits } from "@/lib/publishing/instagram-limits";
import { pullInstagramInsights } from "@/lib/publishing/instagram-insights-pull";
import { limitRefusal } from "@/lib/publishing/route-support";
import { recordNeonEvent } from "@/lib/workspace/audit";

const WORKSPACE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOG = "api/workspaces/instagram-insights/pull";

/**
 * POST /api/workspaces/[workspaceId]/instagram-insights/pull
 *
 * Owner or manager pulls the connected account's platform-reported insights on
 * demand: account metrics for the last 7 days and the lifetime metrics of the
 * newest five media items. Returns `200 { ok, inserted, unavailable, observedAt,
 * mediaScanned, mediaUnavailable }`; metrics Meta did not return are stored as
 * unavailable rows with a reason, never as zero.
 *
 * Refused before any Meta call: 400 invalid id | 404 not_enabled (flag off,
 * before any SQL) | 403 auth | 409 connection_missing/connection_expired |
 * 429 (Retry-After) | 503 limiter or read failure. One audit event
 * (`insights.pulled`) records only counts, never metric values.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  if (!WORKSPACE_ID_RE.test(workspaceId)) return NextResponse.json({ error: "workspaceId is invalid" }, { status: 400 });
  if (!instagramInsightsEnabled()) return NextResponse.json({ error: "not_enabled" }, { status: 404 });

  const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "manager" });
  if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });

  const refused = limitRefusal(await consumeInstagramPublishLimits("insights", { workspaceId }));
  if (refused) return refused;

  let result: Awaited<ReturnType<typeof pullInstagramInsights>>;
  try {
    result = await pullInstagramInsights({ workspaceId });
  } catch {
    console.error(`[${LOG}] unavailable`, { category: "instagram_insights_pull_unavailable", workspaceId });
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });

  await recordNeonEvent({
    workspaceId,
    actorType: "user",
    actorId: auth.user.id,
    event: "insights.pulled",
    entityType: "workspace",
    entityId: workspaceId,
    payload: {
      provider: "instagram",
      inserted: result.inserted,
      unavailable: result.unavailable,
      media_scanned: result.mediaScanned,
      media_unavailable: result.mediaUnavailable,
    },
  });

  return NextResponse.json({
    ok: true,
    inserted: result.inserted,
    unavailable: result.unavailable,
    observedAt: result.observedAt,
    mediaScanned: result.mediaScanned,
    mediaUnavailable: result.mediaUnavailable,
  });
}
