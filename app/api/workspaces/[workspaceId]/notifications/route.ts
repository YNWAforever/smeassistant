import { NextResponse } from "next/server";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { notificationRepository } from "@/lib/repositories/notifications";

/**
 * PATCH /api/workspaces/[workspaceId]/notifications { ids?: string[] } → 200
 * { ok: true, marked: number }
 *
 * P2.5 item 24: `workspace_notifications.read_at` existed from the Phase 6
 * migration and nothing ever wrote it, so the topbar bell's unread dot could
 * never go out. Omitting `ids` marks every unread notification of the caller's
 * read; passing ids marks just those.
 *
 * Any accepted member, like the notifications page itself (CLAUDE.md §3.1
 * route map) and its sibling notification-preferences route -- a viewer owns
 * their own notifications. Authorization does not stop at the route: the
 * repository predicate pins `user_id` to the verified session's own id, so a
 * member sending another member's notification id marks nothing.
 */
const UUID_RE = /^[0-9a-f-]{36}$/i;
/** One page of notifications is 50 rows; a larger id list is not a real client. */
const MAX_IDS = 50;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  if (!UUID_RE.test(workspaceId)) {
    return NextResponse.json({ error: "workspaceId is invalid" }, { status: 400 });
  }

  const auth = await authorizeWorkspaceRequest({ id: workspaceId });
  if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });

  let body: { ids?: unknown } = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text) as { ids?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let ids: string[] | null = null;
  if (body.ids !== undefined) {
    if (!Array.isArray(body.ids) || body.ids.length > MAX_IDS) {
      return NextResponse.json({ error: "ids is invalid" }, { status: 400 });
    }
    if (!body.ids.every((id) => typeof id === "string" && UUID_RE.test(id))) {
      return NextResponse.json({ error: "ids is invalid" }, { status: 400 });
    }
    ids = body.ids as string[];
  }

  try {
    const marked = await notificationRepository().markRead(workspaceId, auth.user.id, ids);
    return NextResponse.json({ ok: true, marked });
  } catch {
    console.error("Failed to mark notifications read", { category: "notification_mark_read_failed" });
    return NextResponse.json({ error: "Failed to mark notifications read" }, { status: 500 });
  }
}
