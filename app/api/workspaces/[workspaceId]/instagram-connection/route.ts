import { NextResponse } from "next/server";

import { authorizeWorkspaceRequest } from "@/lib/auth";
import { instagramConnectionRepository } from "@/lib/repositories/instagram-connection";
import { instagramInsightsRepository } from "@/lib/repositories/instagram-insights";
import { recordNeonEvent } from "@/lib/workspace/audit";

const WORKSPACE_ID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Withdraws the workspace's Instagram (Meta Graph) connection.
 *
 * Owner only: integrations are an owner setting (CLAUDE.md section 3.9), and
 * `authorizeWorkspaceRequest` never accepts staff sessions. DELETE because the
 * operation is idempotent: the repository matches on a usable status, so a
 * second call changes nothing and still answers 200 with
 * `disconnected: false`.
 *
 * Scope note, deliberately not widened: this deletes the credential THIS app
 * stores and revokes it in our database. It does not call Meta's deauthorize
 * endpoint -- that is a separate outbound action, and the UI points the owner
 * at Instagram's own app-management page instead of implying we did more.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  if (!WORKSPACE_ID_RE.test(workspaceId)) {
    return NextResponse.json({ error: "workspaceId is invalid" }, { status: 400 });
  }

  const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "owner" });
  if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });

  // A locale for the audit row only; DELETE callers need not send a body.
  let locale: string | null = null;
  try {
    const body = (await req.json()) as { locale?: unknown };
    if (typeof body?.locale === "string") locale = body.locale;
  } catch {
    // no body
  }

  let disconnected: boolean;
  try {
    disconnected = await instagramConnectionRepository().disconnect(workspaceId);
  } catch {
    console.error("Instagram connection disconnect failed");
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }

  // The observation rows belong to the withdrawn credential: remove them in the
  // same request. Idempotent (a second disconnect deletes nothing) and
  // best-effort: the credential is already revoked, so a failed delete must not
  // turn the answer into an error; the next pull or disconnect retries it.
  let insightsDeleted = 0;
  try {
    insightsDeleted = await instagramInsightsRepository().deleteWorkspace(workspaceId);
  } catch {
    console.error("Instagram insights cleanup failed", { category: "instagram_insights_delete_failed" });
  }

  // The credential is already gone; a failed audit write must not undo that.
  if (disconnected) {
    try {
      await recordNeonEvent({
        workspaceId, actorType: "user", actorId: auth.user.id,
        event: "integration.updated", entityType: "workspace", entityId: workspaceId,
        locale,
        payload: { integration: "instagram", status: "revoked", insights_deleted: insightsDeleted },
      });
    } catch { console.error("Instagram disconnect audit event not recorded"); }
  }

  return NextResponse.json({ ok: true, disconnected, insightsDeleted });
}
