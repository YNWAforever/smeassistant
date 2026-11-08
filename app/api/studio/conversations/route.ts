import { authorizeWorkspaceRequest, inLocationScope } from "@/lib/auth";
import { StudioLocationNotFoundError, studioRepository, toStudioConversation } from "@/lib/repositories/studio";
import { authorizationOrUnavailable } from "@/lib/security/authorization-boundary";
import { conversationStudioEnabled } from "@/lib/studio/flag";
import { STUDIO_CONVERSATION_PAGE, STUDIO_TITLE_MAX } from "@/lib/studio/types";
import {
  authFailure,
  optionalUuid,
  studioDisabledResponse,
  studioError,
  studioJson,
} from "../_shared/studio-route";

/**
 * GET  /api/studio/conversations?workspaceId=&locationId=  — the rail.
 * POST /api/studio/conversations { workspaceId, locationId?, title? } — new chat.
 *
 * Both authorise first (member floor), then filter by the caller's own rows (the
 * repository enforces `workspace_id` AND `created_by`), and never reveal whether
 * another member's or workspace's conversation exists.
 */
export const dynamic = "force-dynamic";

function logFailure(category: string): void {
  console.error("[api/studio/conversations] failed", { category });
}

export async function GET(request: Request): Promise<Response> {
  if (!conversationStudioEnabled()) return studioDisabledResponse();

  const url = new URL(request.url);
  const workspaceId = optionalUuid(url.searchParams.get("workspaceId"));
  const locationId = optionalUuid(url.searchParams.get("locationId"));
  if (!workspaceId || locationId === null) return studioError("invalid_input");

  const auth = await authorizationOrUnavailable(() => authorizeWorkspaceRequest({ id: workspaceId }));
  if (!auth) return studioError("unavailable");
  if (!auth.ok) return authFailure(auth);
  if (locationId && !inLocationScope(auth.membership, locationId)) return studioError("not_found");

  try {
    const rows = await studioRepository().listConversations({
      workspaceId: auth.membership.workspaceId,
      actorId: auth.membership.userId,
      locationId: locationId ?? null,
      limit: STUDIO_CONVERSATION_PAGE,
    });
    return studioJson({ conversations: rows.map(toStudioConversation) });
  } catch {
    logFailure("conversation_list_failed");
    return studioError("unavailable");
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!conversationStudioEnabled()) return studioDisabledResponse();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return studioError("invalid_input");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return studioError("invalid_input");
  const body = payload as Record<string, unknown>;

  const workspaceId = optionalUuid(body.workspaceId);
  const locationId = optionalUuid(body.locationId);
  if (!workspaceId || locationId === null) return studioError("invalid_input");
  let title: string | undefined;
  if (body.title !== undefined && body.title !== null) {
    if (typeof body.title !== "string") return studioError("invalid_input");
    title = body.title.trim();
    if (title.length > STUDIO_TITLE_MAX) return studioError("invalid_input");
  }

  const auth = await authorizationOrUnavailable(() => authorizeWorkspaceRequest({ id: workspaceId }));
  if (!auth) return studioError("unavailable");
  if (!auth.ok) return authFailure(auth);
  if (locationId && !inLocationScope(auth.membership, locationId)) return studioError("not_found");

  try {
    const row = await studioRepository().createConversation({
      workspaceId: auth.membership.workspaceId,
      actorId: auth.membership.userId,
      locationId: locationId ?? null,
      ...(title !== undefined ? { title } : {}),
    });
    // The page shows the context rail immediately, so the created conversation
    // is returned with its workspace-scoped state (session, not cache).
    return studioJson({ conversation: toStudioConversation(row) }, 201);
  } catch (error) {
    if (error instanceof StudioLocationNotFoundError) return studioError("not_found");
    logFailure("conversation_create_failed");
    return studioError("unavailable");
  }
}
