import { NextResponse } from "next/server";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { getPool } from "@/lib/db/client";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { invitationMailEnabled } from "@/lib/mail/feature-flags";
import { sendInvitation } from "@/lib/mail/invitation";
import { createMailTransport, type MailSendStatus } from "@/lib/mail/transport";
import { membershipRepository, type InvitationContext } from "@/lib/repositories/membership";
import { recordClaimAuditEvent } from "@/lib/repositories/claims";
import { enforceCompositeIdentifierRateLimit, rateLimitedResponse, rateLimitUnavailableResponse } from "@/lib/security/rate-limit";

/**
 * POST /api/workspaces/[workspaceId]/members/[memberId]/resend
 *   { locale? } → { invitation: { status }, invitedAt }
 *
 * Owner only. Renews a pending (non-owner) invitation window and mails it
 * again; 3 a day per member. Order: flag, auth, rate limit, refresh, send,
 * audit (`member.invitation_resent`). Mail failures are reported as
 * `invitation.status`, never thrown; logs carry a category only.
 */
const WORKSPACE_ID_RE = /^[0-9a-f-]{36}$/i;

export async function POST(req: Request, { params }: { params: Promise<{ workspaceId: string; memberId: string }> }) {
  if (!invitationMailEnabled()) return NextResponse.json({ error: "not_enabled" }, { status: 404 });

  const { workspaceId, memberId } = await params;
  if (!WORKSPACE_ID_RE.test(workspaceId)) {
    return NextResponse.json({ error: "workspaceId is invalid" }, { status: 400 });
  }
  if (!memberId || memberId.length > 128) {
    return NextResponse.json({ error: "memberId is invalid" }, { status: 400 });
  }

  const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "owner" });
  if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });

  const limit = await enforceCompositeIdentifierRateLimit({ req, scope: "invitation_resend", identifier: memberId, failClosed: true });
  if (limit.unavailable) return rateLimitUnavailableResponse();
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

  let body: { locale?: unknown } = {};
  try {
    const parsed: unknown = await req.json();
    if (parsed && typeof parsed === "object") body = parsed as { locale?: unknown };
  } catch {
    // An empty or malformed body just means the default locale.
  }
  const locale = isLocale(body.locale) ? body.locale : DEFAULT_LOCALE;

  let context: InvitationContext | null;
  try {
    context = await membershipRepository.refreshInvitation(workspaceId, memberId);
  } catch {
    console.error("[mail] invitation_refresh_failed", { category: "invitation_refresh_failed" });
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if (!context) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let status: MailSendStatus = "failed";
  try {
    status = (
      await sendInvitation({
        db: getPool(),
        transport: createMailTransport(),
        env: process.env,
        member: { id: memberId, email: context.email, role: context.role, invitedAt: context.invitedAt },
        workspaceId,
        workspaceName: context.workspaceName,
        locale,
        origin: process.env.APP_ORIGIN ?? "",
      })
    ).status;
  } catch {
    console.error("[mail] invitation_send_failed", { category: "invitation_send_failed" });
  }

  await recordClaimAuditEvent({
    workspace_id: workspaceId,
    actor_type: "user",
    actor_id: auth.user.id,
    event: "member.invitation_resent",
    entity_type: "workspace_member",
    entity_id: memberId,
    payload: { locale },
  });

  return NextResponse.json({ invitation: { status }, invitedAt: context.invitedAt });
}
