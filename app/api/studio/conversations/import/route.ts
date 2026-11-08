import { authorizeWorkspaceRequest, inLocationScope } from "@/lib/auth";
import { StudioLocationNotFoundError, studioRepository, toStudioConversation } from "@/lib/repositories/studio";
import { authorizationOrUnavailable } from "@/lib/security/authorization-boundary";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { conversationStudioEnabled } from "@/lib/studio/flag";
import { STUDIO_MESSAGE_MAX, STUDIO_TITLE_MAX } from "@/lib/studio/types";
import { conversationHomeEnabled } from "@/lib/workspace/conversation-flag";
import { ipHashFor, recordNeonEvent } from "@/lib/workspace/audit";
import { ConversationDocumentError, listConversationDocuments } from "@/lib/workspace/conversation-documents";
import { STUDIO_IMPORT_MAX_NOTES } from "@/lib/repositories/studio";
import {
  authFailure,
  optionalUuid,
  studioDisabledResponse,
  studioError,
  studioJson,
} from "../../_shared/studio-route";

export const dynamic = "force-dynamic";

/**
 * POST /api/studio/conversations/import (convergence slice)
 *
 * Promotes one browser-local workbench thread into a persistent Studio
 * conversation: the local notes become the opening user turns in order. The
 * local copy is never deleted, so the bridge is additive and reversible.
 *
 * Body `{ workspaceId, locationId?, title, notes: string[] }`.
 * Pre-stream order: flags → body → membership → location scope → rate limit →
 * transactional import → audit `conversation.imported` (counts only, no text).
 */
function logFailure(category: string): void {
  console.error("[api/studio/conversations/import] failed", { category });
}

export async function POST(request: Request): Promise<Response> {
  if (!conversationStudioEnabled() || !conversationHomeEnabled()) return studioDisabledResponse();

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
  if (typeof body.title !== "string") return studioError("invalid_input");
  const title = body.title.trim();
  if (title.length > STUDIO_TITLE_MAX) return studioError("invalid_input");
  if (!Array.isArray(body.notes) || body.notes.length < 1 || body.notes.length > STUDIO_IMPORT_MAX_NOTES) {
    return studioError("invalid_input");
  }
  const notes = body.notes.map((note) => (typeof note === "string" ? note.trim() : ""));
  if (notes.some((note) => note.length < 1 || note.length > STUDIO_MESSAGE_MAX)) return studioError("invalid_input");
  const rawDocumentIds = body.documentVersionIds;
  if (rawDocumentIds !== undefined && (!Array.isArray(rawDocumentIds) || rawDocumentIds.length > 5)) return studioError("invalid_input");
  const documentVersionIds = rawDocumentIds === undefined
    ? []
    : (rawDocumentIds as unknown[]).map((id) => optionalUuid(id));
  if (documentVersionIds.some((id) => id === null) || new Set(documentVersionIds).size !== documentVersionIds.length) {
    return studioError("invalid_input");
  }

  const auth = await authorizationOrUnavailable(() => authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "manager" }));
  if (!auth) return studioError("unavailable");
  if (!auth.ok) return authFailure(auth);
  if (locationId && !inLocationScope(auth.membership, locationId)) return studioError("not_found");

  let documents: Array<{ documentVersionId: string; title: string; truncated: boolean }> = [];
  if (documentVersionIds.length) {
    try {
      documents = (await listConversationDocuments(
        { workspaceId: auth.membership.workspaceId, locationId: locationId ?? null },
        documentVersionIds as string[],
      )).map((version) => ({ documentVersionId: version.id, title: version.title, truncated: version.truncated }));
    } catch (error) {
      if (error instanceof ConversationDocumentError) return studioError(error.code === "document_not_found" ? "not_found" : "invalid_input");
      return studioError("unavailable");
    }
  }

  const decision = await enforceRateLimit({
    req: request,
    scope: "studio_import",
    identifiers: [auth.user.id],
    failClosed: true,
  });
  if (!decision.allowed) return rateLimitedResponse(decision.retryAfterSeconds);

  try {
    const result = await studioRepository().importConversation({
      workspaceId: auth.membership.workspaceId,
      actorId: auth.user.id,
      locationId: locationId ?? null,
      title,
      notes,
      documents,
    });
    await recordNeonEvent({
      workspaceId: auth.membership.workspaceId,
      locationId: locationId ?? null,
      actorType: "user",
      actorId: auth.user.id,
      event: "conversation.imported",
      entityType: "conversation",
      entityId: result.conversation.id,
      ipHash: ipHashFor(request),
      // Counts and surface only; the note text never reaches the audit log.
      payload: { surface: "conversation", notes: result.messageCount },
    });
    return studioJson({ conversation: toStudioConversation(result.conversation) }, 201);
  } catch (error) {
    if (error instanceof StudioLocationNotFoundError) return studioError("not_found");
    logFailure("conversation_import_failed");
    return studioError("unavailable");
  }
}
