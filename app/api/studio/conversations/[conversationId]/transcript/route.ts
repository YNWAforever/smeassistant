import { authorizeWorkspaceRequest } from "@/lib/auth";
import { studioRepository, toStudioConversation, toStudioMessage } from "@/lib/repositories/studio";
import { authorizationOrUnavailable } from "@/lib/security/authorization-boundary";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { conversationStudioEnabled } from "@/lib/studio/flag";
import { studioTranscriptMarkdown } from "@/lib/studio/transcript";
import { ipHashFor, recordNeonEvent } from "@/lib/workspace/audit";
import {
  authFailure,
  optionalUuid,
  parseStudioLocale,
  studioDisabledResponse,
  studioError,
} from "../../../_shared/studio-route";

export const dynamic = "force-dynamic";

/**
 * GET /api/studio/conversations/[id]/transcript (P3, read-only)
 *
 * Returns a Markdown transcript for the caller's conversation (owner or shared
 * member). The response is an attachment; no content is written and the audit
 * row records only the message count. Message text never appears in the audit
 * payload.
 */
function logFailure(category: string): void {
  console.error("[api/studio/transcript] failed", { category });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  if (!conversationStudioEnabled()) return studioDisabledResponse();
  const { conversationId: rawId } = await params;
  const conversationId = optionalUuid(rawId);
  const url = new URL(request.url);
  const workspaceId = optionalUuid(url.searchParams.get("workspaceId"));
  const locale = parseStudioLocale(request);
  if (!conversationId || !workspaceId || !locale) return studioError("invalid_input");

  const auth = await authorizationOrUnavailable(() => authorizeWorkspaceRequest({ id: workspaceId }));
  if (!auth) return studioError("unavailable");
  if (!auth.ok) return authFailure(auth);

  const decision = await enforceRateLimit({ req: request, scope: "studio_export", identifiers: [auth.user.id], failClosed: true });
  if (!decision.allowed) return rateLimitedResponse(decision.retryAfterSeconds);

  try {
    const repository = studioRepository();
    const conversation = await repository.getConversation({
      workspaceId,
      actorId: auth.user.id,
      conversationId,
    });
    if (!conversation) return studioError("not_found");
    const rows = await repository.listConversationTranscript({
      workspaceId,
      actorId: auth.user.id,
      conversationId,
    });
    const messages = rows.map(toStudioMessage);
    const markdown = studioTranscriptMarkdown({
      locale,
      conversation: toStudioConversation(conversation),
      messages,
    });
    await recordNeonEvent({
      workspaceId,
      actorType: "user",
      actorId: auth.user.id,
      event: "conversation.exported",
      entityType: "conversation",
      entityId: conversationId,
      ipHash: ipHashFor(request),
      payload: { surface: "conversation", messages: messages.length },
    });
    return new Response(markdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="studio-${conversationId}.md"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    logFailure("transcript_export_failed");
    return studioError("unavailable");
  }
}
