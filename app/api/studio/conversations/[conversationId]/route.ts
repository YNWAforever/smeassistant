import { authorizeWorkspaceRequest } from "@/lib/auth";
import { studioRepository, toStudioConversation, toStudioMessage } from "@/lib/repositories/studio";
import { authorizationOrUnavailable } from "@/lib/security/authorization-boundary";
import { conversationStudioEnabled } from "@/lib/studio/flag";
import { STUDIO_MESSAGE_PAGE, STUDIO_TITLE_MAX, studioConversationStatuses, type StudioConversationStatus } from "@/lib/studio/types";
import {
  authFailure,
  optionalPositiveInt,
  optionalUuid,
  studioDisabledResponse,
  studioError,
  studioJson,
} from "../../_shared/studio-route";

/**
 * GET   /api/studio/conversations/[conversationId] — one conversation + its turns.
 * PATCH /api/studio/conversations/[conversationId] — rename and/or archive.
 *
 * The repository scopes every read and write to `workspace_id` AND
 * `created_by`, so a conversation that belongs to another member or workspace
 * is indistinguishable from a missing one: both are 404.
 */
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LIMIT = 200;

function logFailure(category: string): void {
  console.error("[api/studio/conversation] failed", { category });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  if (!conversationStudioEnabled()) return studioDisabledResponse();

  const { conversationId: rawId } = await params;
  const conversationId = optionalUuid(rawId);
  if (!conversationId) return studioError("invalid_input");

  const url = new URL(request.url);
  const workspaceId = optionalUuid(url.searchParams.get("workspaceId"));
  const beforeSeq = optionalPositiveInt(url.searchParams.get("beforeSeq"));
  const limit = optionalPositiveInt(url.searchParams.get("limit"));
  if (!workspaceId || beforeSeq === null || limit === null || (limit !== undefined && limit > MAX_MESSAGE_LIMIT)) {
    return studioError("invalid_input");
  }

  const auth = await authorizationOrUnavailable(() => authorizeWorkspaceRequest({ id: workspaceId }));
  if (!auth) return studioError("unavailable");
  if (!auth.ok) return authFailure(auth);

  try {
    const repository = studioRepository();
    const conversation = await repository.getConversation({ workspaceId: auth.membership.workspaceId, actorId: auth.membership.userId, conversationId });
    if (!conversation) return studioError("not_found");
    const pageSize = limit ?? STUDIO_MESSAGE_PAGE;
    // One row past the page is how `hasMore` is decided without a second COUNT.
    const rows = await repository.listMessages({
      workspaceId: auth.membership.workspaceId,
      actorId: auth.membership.userId,
      conversationId,
      limit: Math.min(pageSize + 1, MAX_MESSAGE_LIMIT),
      ...(beforeSeq !== undefined ? { beforeSeq } : {}),
    });
    const hasMore = rows.length > pageSize;
    const page = hasMore ? rows.slice(rows.length - pageSize) : rows;
    return studioJson({
      conversation: toStudioConversation(conversation),
      messages: page.map(toStudioMessage),
      hasMore,
    });
  } catch {
    logFailure("conversation_read_failed");
    return studioError("unavailable");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  if (!conversationStudioEnabled()) return studioDisabledResponse();

  const { conversationId: rawId } = await params;
  const conversationId = optionalUuid(rawId);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return studioError("invalid_input");
  }
  if (!conversationId) return studioError("invalid_input");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return studioError("invalid_input");
  const body = payload as Record<string, unknown>;

  const workspaceId = optionalUuid(body.workspaceId);
  if (!workspaceId) return studioError("invalid_input");

  let title: string | undefined;
  if (body.title !== undefined) {
    if (typeof body.title !== "string") return studioError("invalid_input");
    title = body.title.trim();
    if (!title || title.length > STUDIO_TITLE_MAX) return studioError("invalid_input");
  }
  let status: StudioConversationStatus | undefined;
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !(studioConversationStatuses as readonly string[]).includes(body.status)) {
      return studioError("invalid_input");
    }
    status = body.status as StudioConversationStatus;
  }
  // A PATCH that changes nothing is a client bug, not a no-op success.
  if (title === undefined && status === undefined) return studioError("invalid_input");

  const auth = await authorizationOrUnavailable(() => authorizeWorkspaceRequest({ id: workspaceId }));
  if (!auth) return studioError("unavailable");
  if (!auth.ok) return authFailure(auth);

  const scope = { workspaceId: auth.membership.workspaceId, actorId: auth.membership.userId, conversationId };
  try {
    const repository = studioRepository();
    const existing = await repository.getConversation(scope);
    if (!existing) return studioError("not_found");
    let conversation = existing;
    if (status === "archived") {
      const archived = await repository.archiveConversation(scope);
      if (!archived) return studioError("not_found");
      conversation = archived;
    }
    if (title !== undefined) {
      const renamed = await repository.renameConversation({ ...scope, title });
      if (!renamed) return studioError("not_found");
      conversation = renamed;
    }
    return studioJson({ conversation: toStudioConversation(conversation) });
  } catch {
    logFailure("conversation_update_failed");
    return studioError("unavailable");
  }
}
