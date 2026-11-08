import { authorizeWorkspaceRequest } from "@/lib/auth";
import { studioRepository } from "@/lib/repositories/studio";
import { authorizationOrUnavailable } from "@/lib/security/authorization-boundary";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { conversationStudioEnabled } from "@/lib/studio/flag";
import { ipHashFor, recordNeonEvent } from "@/lib/workspace/audit";
import { authFailure, optionalUuid, studioDisabledResponse, studioError, studioJson } from "../../../_shared/studio-route";

export const dynamic = "force-dynamic";

/**
 * Conversation sharing (v1.1 P1.3).
 *
 * GET    — current members, share candidates and whether the caller owns the
 *          conversation (only the owner may add/remove members).
 * POST   — owner adds an accepted workspace member as `editor` or `viewer`.
 * DELETE — owner removes a member (`?userId=`).
 *
 * Authorization is app-layer: membership is resolved first, then the repository
 * proves the caller can see the conversation; a foreign id is 404, never 403.
 */
function logFailure(category: string): void {
  console.error("[api/studio/conversation-members] failed", { category });
}

async function resolve(request: Request, conversationId: string) {
  const url = new URL(request.url);
  const workspaceId = optionalUuid(url.searchParams.get("workspaceId"));
  if (!conversationId || !workspaceId) return { error: studioError("invalid_input") } as const;
  const auth = await authorizationOrUnavailable(() => authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "manager" }));
  if (!auth) return { error: studioError("unavailable") } as const;
  if (!auth.ok) return { error: authFailure(auth) } as const;
  return {
    workspaceId,
    actorId: auth.user.id,
    userEmail: auth.user.email,
    repository: studioRepository(),
  } as const;
}

export async function GET(request: Request, { params }: { params: Promise<{ conversationId: string }> }): Promise<Response> {
  if (!conversationStudioEnabled()) return studioDisabledResponse();
  const { conversationId: rawId } = await params;
  const conversationId = optionalUuid(rawId);
  if (!conversationId) return studioError("invalid_input");
  const context = await resolve(request, conversationId);
  if ("error" in context && context.error) return context.error;
  try {
    const conversation = await context.repository.getConversation({
      workspaceId: context.workspaceId,
      actorId: context.actorId,
      conversationId,
    });
    if (!conversation) return studioError("not_found");
    const members = await context.repository.listConversationMembers({
      workspaceId: context.workspaceId,
      actorId: context.actorId,
      conversationId,
    });
    if (!members) return studioError("not_found");
    const candidates = conversation.access_role === "owner"
      ? await context.repository.listShareCandidates({ workspaceId: context.workspaceId, actorId: context.actorId, conversationId: rawId })
      : [];
    return studioJson({
      members,
      candidates: candidates ?? [],
      canManage: conversation.access_role === "owner",
      accessRole: conversation.access_role ?? "owner",
    });
  } catch {
    logFailure("members_read_failed");
    return studioError("unavailable");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }): Promise<Response> {
  if (!conversationStudioEnabled()) return studioDisabledResponse();
  const { conversationId: rawId } = await params;
  const conversationId = optionalUuid(rawId);
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return studioError("invalid_input");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return studioError("invalid_input");
  const body = payload as Record<string, unknown>;
  const workspaceId = optionalUuid(body.workspaceId);
  const userId = optionalUuid(body.userId);
  const role = body.role === "editor" || body.role === "viewer" ? body.role : null;
  if (!conversationId || !workspaceId || !userId || !role) return studioError("invalid_input");

  const auth = await authorizationOrUnavailable(() => authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "manager" }));
  if (!auth) return studioError("unavailable");
  if (!auth.ok) return authFailure(auth);

  const decision = await enforceRateLimit({ req: request, scope: "studio_share", identifiers: [auth.user.id], failClosed: true });
  if (!decision.allowed) return rateLimitedResponse(decision.retryAfterSeconds);

  try {
    const member = await studioRepository().addConversationMember({
      workspaceId,
      actorId: auth.user.id,
      conversationId,
      userId,
      role,
    });
    await recordNeonEvent({
      workspaceId,
      actorType: "user",
      actorId: auth.user.id,
      event: "conversation.shared",
      entityType: "conversation",
      entityId: conversationId,
      ipHash: ipHashFor(request),
      // Who and what role only; never conversation content.
      payload: { role, memberId: userId },
    });
    return studioJson({ member }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "studio_share_target_not_member") return studioError("invalid_input");
    if (error instanceof Error && error.message === "studio_share_self") return studioError("invalid_input");
    if (error instanceof Error && error.name === "StudioConversationNotFoundError") return studioError("not_found");
    logFailure("member_add_failed");
    return studioError("unavailable");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ conversationId: string }> }): Promise<Response> {
  if (!conversationStudioEnabled()) return studioDisabledResponse();
  const { conversationId: rawId } = await params;
  const conversationId = optionalUuid(rawId);
  const url = new URL(request.url);
  const workspaceId = optionalUuid(url.searchParams.get("workspaceId"));
  const userId = optionalUuid(url.searchParams.get("userId"));
  if (!conversationId || !workspaceId || !userId) return studioError("invalid_input");

  const auth = await authorizationOrUnavailable(() => authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "manager" }));
  if (!auth) return studioError("unavailable");
  if (!auth.ok) return authFailure(auth);

  const decision = await enforceRateLimit({ req: request, scope: "studio_share", identifiers: [auth.user.id], failClosed: true });
  if (!decision.allowed) return rateLimitedResponse(decision.retryAfterSeconds);

  try {
    const removed = await studioRepository().removeConversationMember({
      workspaceId,
      actorId: auth.user.id,
      conversationId,
      userId,
    });
    if (!removed) return studioError("not_found");
    await recordNeonEvent({
      workspaceId,
      actorType: "user",
      actorId: auth.user.id,
      event: "conversation.member_removed",
      entityType: "conversation",
      entityId: conversationId,
      ipHash: ipHashFor(request),
      payload: { memberId: userId },
    });
    return studioJson({ removed: true });
  } catch {
    logFailure("member_remove_failed");
    return studioError("unavailable");
  }
}
