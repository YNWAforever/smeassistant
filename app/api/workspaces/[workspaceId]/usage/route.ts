import { NextResponse } from "next/server";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { workspaceReadRepository } from "@/lib/repositories/workspace-read";
import { getUsage } from "@/lib/workspace/usage";
import { isWorkspaceTier } from "@/lib/workspace/entitlement";

const WORKSPACE_ID_RE = /^[0-9a-f-]{36}$/i;

/**
 * GET /api/workspaces/[id]/usage → { period, approved_deliveries, allowance, tier }
 * (CLAUDE.md §3.2.3, §3.10). Any accepted member may read: the sidebar and
 * the delivery card both show "n / allowance". The row is created lazily for
 * the current period in the workspace timezone.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  if (!WORKSPACE_ID_RE.test(workspaceId)) {
    return NextResponse.json(
      { error: "workspaceId is invalid" },
      { status: 400 },
    );
  }

  const auth = await authorizeWorkspaceRequest({ id: workspaceId });
  if (!auth.ok)
    return NextResponse.json({ error: auth.code }, { status: auth.status });

  const db = workspaceReadRepository();
  try {
    const workspace = (await db.workspaces([workspaceId]))[0];
    if (!workspace)
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    const tier = isWorkspaceTier(workspace.tier) ? workspace.tier : "lite";
    const usage = await getUsage(
      db,
      workspaceId,
      workspace.timezone ?? "Asia/Hong_Kong",
      tier,
    );
    return NextResponse.json({
      period: usage.period,
      approved_deliveries: usage.approvedDeliveries,
      allowance: usage.allowance,
      tier,
    });
  } catch {
    console.error("[workspaces/usage] read failed", {
      category: "usage_read_failed",
    });
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
