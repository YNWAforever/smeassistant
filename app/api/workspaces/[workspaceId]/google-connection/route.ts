import { NextResponse } from "next/server";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { claimsRepository } from "@/lib/repositories/claims";
import { recordNeonEvent } from "@/lib/workspace/audit";

const WORKSPACE_ID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Withdraws the workspace's Google Business Profile connection.
 *
 * Onboarding has always told the owner "you can disconnect at any time in
 * settings" and /trust promised the credential goes when the connection does,
 * but nothing implemented either: the only writer of `status='revoked'` was
 * `replaceGoogleConnection`, which revokes the PREVIOUS credential while
 * installing a NEW one -- so a granted scope could never actually be
 * withdrawn. Withdrawing a granted scope is a guardrail commitment (6/9), not
 * marketing copy, which is why this is built rather than reworded.
 *
 * Owner only: integrations are an owner setting (CLAUDE.md section 3.9), and
 * `authorizeWorkspaceRequest` never accepts a staff session here.
 *
 * DELETE rather than POST because it is idempotent by construction: the
 * repository matches on `status='active'`, so a second call changes nothing and
 * still answers 200. `disconnected` says which of the two happened.
 *
 * Scope note, deliberately not widened: this deletes the credential THIS app
 * stores. It does not call Google's revocation endpoint -- that would need a
 * decrypt path (`decryptToken` has no production call site; these tokens are
 * write-only) plus an outbound provider call, which CLAUDE.md gates as a
 * separately authorized action. The UI therefore points the owner at their
 * Google Account for account-level removal instead of implying we did it.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  if (!WORKSPACE_ID_RE.test(workspaceId)) {
    return NextResponse.json({ error: "workspaceId is invalid" }, { status: 400 });
  }

  const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "owner" });
  if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });

  // A locale for the audit row only; absent or malformed is not worth refusing
  // a disconnect over, and DELETE callers need not send a body at all.
  let locale: string | null = null;
  try {
    const body = (await req.json()) as { locale?: unknown };
    if (typeof body?.locale === "string") locale = body.locale;
  } catch {
    // no body
  }

  let disconnected: boolean;
  try {
    disconnected = await claimsRepository.disconnectGoogleConnection(workspaceId);
  } catch {
    console.error("Google connection disconnect failed");
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }

  // The credential is already gone; a failed audit write must not undo that.
  if (disconnected) {
    try {
      await recordNeonEvent({
        workspaceId, actorType: "user", actorId: auth.user.id,
        event: "integration.updated", entityType: "workspace", entityId: workspaceId,
        locale,
        payload: { integration: "google_gbp", status: "revoked" },
      });
    } catch { console.error("Google disconnect audit event not recorded"); }
  }

  return NextResponse.json({ ok: true, disconnected });
}
