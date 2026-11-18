import { NextResponse } from "next/server";

import { authorizeWorkspaceRequest } from "@/lib/auth";
import { instagramInsightsEnabled } from "@/lib/publishing/flag";
import { loadInstagramInsightsPanel } from "@/lib/publishing/instagram-insights-state";

const WORKSPACE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOG = "api/workspaces/instagram-insights";

/**
 * GET /api/workspaces/[workspaceId]/instagram-insights
 *
 * The newest stored observation per (scope, media item, metric), plus the
 * account connection state and the newest observed time. Members may read;
 * pulling remains owner/manager. 404 `not_enabled` while the flag is off (no
 * SQL), 403 auth, 503 read failure. Values are what Meta returned; a metric
 * Meta did not return has `value: null` and an `unavailableReason`.
 */
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  if (!WORKSPACE_ID_RE.test(workspaceId)) return NextResponse.json({ error: "workspaceId is invalid" }, { status: 400 });
  if (!instagramInsightsEnabled()) return NextResponse.json({ error: "not_enabled" }, { status: 404 });

  const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "viewer" });
  if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });

  const panel = await loadInstagramInsightsPanel({ workspaceId });
  if (!panel) {
    console.error(`[${LOG}] unavailable`, { category: "instagram_insights_unavailable", workspaceId });
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, ...panel });
}
