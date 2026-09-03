import { NextResponse } from "next/server";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/admin";

/**
 * Lets a workspace member toggle their workspace's notification preferences.
 *
 * Ported from upstream's /api/owner/workspaces/[workspaceId]/notification-
 * preferences. Upstream required owner/manager; here the notifications page
 * is a member page (CLAUDE.md §3.1 route map), so any accepted member may
 * PATCH -- authorizeWorkspaceRequest with no minRole. Staff sessions are
 * never accepted. The write itself is unchanged.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) {
    return NextResponse.json({ error: "workspaceId is invalid" }, { status: 400 });
  }

  const auth = await authorizeWorkspaceRequest({ id: workspaceId });
  if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });

  let body: { notifyRescanComplete?: unknown; notifyRegressionAlert?: unknown; notifyMonthlyDigest?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, boolean> = {};
  if (typeof body.notifyRescanComplete === "boolean") updates.notify_rescan_complete = body.notifyRescanComplete;
  if (typeof body.notifyRegressionAlert === "boolean") updates.notify_regression_alert = body.notifyRegressionAlert;
  if (typeof body.notifyMonthlyDigest === "boolean") updates.notify_monthly_digest = body.notifyMonthlyDigest;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid preference fields provided" }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { error } = await supabase.from("workspaces").update(updates).eq("id", workspaceId);
  if (error) {
    console.error("Failed to update notification preferences", error);
    return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
