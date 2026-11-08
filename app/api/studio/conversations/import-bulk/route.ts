import { authorizeWorkspaceRequest, inLocationScope } from "@/lib/auth";
import {
  STUDIO_IMPORT_MAX_TOTAL_NOTES,
  STUDIO_IMPORT_MAX_THREADS,
  StudioLocationNotFoundError,
  studioRepository,
  toStudioConversation,
} from "@/lib/repositories/studio";
import { authorizationOrUnavailable } from "@/lib/security/authorization-boundary";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { conversationStudioEnabled } from "@/lib/studio/flag";
import { STUDIO_MESSAGE_MAX, STUDIO_TITLE_MAX } from "@/lib/studio/types";
import { conversationHomeEnabled } from "@/lib/workspace/conversation-flag";
import { ipHashFor, recordNeonEvent } from "@/lib/workspace/audit";
import {
  authFailure,
  optionalUuid,
  studioDisabledResponse,
  studioError,
  studioJson,
} from "../../_shared/studio-route";

export const dynamic = "force-dynamic";

/**
 * POST /api/studio/conversations/import-bulk (convergence slice)
 *
 * Promotes several browser-local workbench threads in one request. The same
 * boundaries as the single import apply, plus a stricter limiter because one
 * call can create many conversations. Atomic: any invalid thread rejects the
 * whole batch before the transaction.
 *
 * Body `{ workspaceId, locationId?, threads: [{ title, notes: string[] }] }`.
 */
function logFailure(category: string): void {
  console.error("[api/studio/conversations/import-bulk] failed", { category });
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
  if (!Array.isArray(body.threads) || body.threads.length < 1 || body.threads.length > STUDIO_IMPORT_MAX_THREADS) {
    return studioError("invalid_input");
  }
  let totalNotes = 0;
  const threads: Array<{ title: string; notes: string[] }> = [];
  for (const raw of body.threads) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return studioError("invalid_input");
    const thread = raw as Record<string, unknown>;
    const title = typeof thread.title === "string" ? thread.title.trim() : "";
    if (title.length > STUDIO_TITLE_MAX) return studioError("invalid_input");
    if (!Array.isArray(thread.notes) || thread.notes.length < 1) return studioError("invalid_input");
    const notes = thread.notes.map((note) => (typeof note === "string" ? note.trim() : ""));
    if (notes.some((note) => note.length < 1 || note.length > STUDIO_MESSAGE_MAX)) return studioError("invalid_input");
    totalNotes += notes.length;
    threads.push({ title, notes });
  }
  if (totalNotes > STUDIO_IMPORT_MAX_TOTAL_NOTES) return studioError("invalid_input");

  const auth = await authorizationOrUnavailable(() => authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "manager" }));
  if (!auth) return studioError("unavailable");
  if (!auth.ok) return authFailure(auth);
  if (locationId && !inLocationScope(auth.membership, locationId)) return studioError("not_found");

  const decision = await enforceRateLimit({
    req: request,
    scope: "studio_import_bulk",
    identifiers: [auth.user.id],
    failClosed: true,
  });
  if (!decision.allowed) return rateLimitedResponse(decision.retryAfterSeconds);

  try {
    const result = await studioRepository().importConversations({
      workspaceId: auth.membership.workspaceId,
      actorId: auth.user.id,
      locationId: locationId ?? null,
      threads,
    });
    await recordNeonEvent({
      workspaceId: auth.membership.workspaceId,
      locationId: locationId ?? null,
      actorType: "user",
      actorId: auth.user.id,
      event: "conversation.imported",
      entityType: null,
      entityId: null,
      ipHash: ipHashFor(request),
      // Counts only; the note text never reaches the audit log.
      payload: { surface: "conversation", threads: result.conversations.length, notes: result.messageCount },
    });
    return studioJson({
      conversations: result.conversations.map(toStudioConversation),
      messageCount: result.messageCount,
    }, 201);
  } catch (error) {
    if (error instanceof StudioLocationNotFoundError) return studioError("not_found");
    logFailure("conversation_import_bulk_failed");
    return studioError("unavailable");
  }
}
