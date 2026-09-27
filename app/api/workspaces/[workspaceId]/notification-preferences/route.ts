import { NextResponse } from "next/server";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import {
  notificationRepository,
  type NotificationPreferences,
} from "@/lib/repositories/notifications";

/**
 * Lets the workspace owner toggle the workspace's email-allow switches.
 *
 * Ported from upstream's /api/owner/workspaces/[workspaceId]/notification-
 * preferences. Originally any accepted member could PATCH here (CLAUDE.md
 * §3.1 marked notifications a member page), but the mail outbox
 * (docs/superpowers/specs/2026-09-27-mail-outbox-design.md §6) makes these
 * three switches an owner-only gate on what the workspace may email at all
 * -- "Allow these emails in this workspace" -- so this is now minRole:
 * "owner" (global-constraints.md departure 2). A member's own opt-in for
 * mail they are allowed to receive is the separate, any-member
 * my-mail-preferences route. Staff sessions are never accepted. The write
 * itself is unchanged.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) {
    return NextResponse.json(
      { error: "workspaceId is invalid" },
      { status: 400 },
    );
  }

  const auth = await authorizeWorkspaceRequest(
    { id: workspaceId },
    { minRole: "owner" },
  );
  if (!auth.ok)
    return NextResponse.json({ error: auth.code }, { status: auth.status });

  let body: {
    notifyRescanComplete?: unknown;
    notifyRegressionAlert?: unknown;
    notifyMonthlyDigest?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: NotificationPreferences = {};
  if (typeof body.notifyRescanComplete === "boolean")
    updates.notify_rescan_complete = body.notifyRescanComplete;
  if (typeof body.notifyRegressionAlert === "boolean")
    updates.notify_regression_alert = body.notifyRegressionAlert;
  if (typeof body.notifyMonthlyDigest === "boolean")
    updates.notify_monthly_digest = body.notifyMonthlyDigest;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid preference fields provided" },
      { status: 400 },
    );
  }

  try {
    await notificationRepository().updatePreferences(workspaceId, updates);
  } catch {
    console.error("Failed to update notification preferences", {
      category: "notification_preferences_failed",
    });
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
