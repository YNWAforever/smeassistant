import { authorizeWorkspaceRequest, inLocationScope } from "@/lib/auth";
import { AssistantAccessError } from "@/lib/assistant/errors";
import { artifactRepository } from "@/lib/repositories/artifacts";
import { studioRepository } from "@/lib/repositories/studio";
import { checkAiBudget, type AiBudgetDecision } from "@/lib/budgets/ai";
import { authorizationOrUnavailable } from "@/lib/security/authorization-boundary";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { buildStudioBriefing } from "@/lib/studio/context";
import { isRetryableStudioError, studioErrorMessage } from "@/lib/studio/errors";
import { conversationStudioEnabled } from "@/lib/studio/flag";
import { runStudioTurn } from "@/lib/studio/orchestrator";
import { acquireStudioTurnLock } from "@/lib/studio/turn-lock";
import { STUDIO_MESSAGE_MAX, type StudioErrorCode, type StudioStreamEvent } from "@/lib/studio/types";
import { ipHashFor, recordNeonEvent } from "@/lib/workspace/audit";
import {
  STUDIO_SSE_HEADERS,
  authFailure,
  optionalUuid,
  parseStudioLocale,
  studioDisabledResponse,
  studioError,
} from "../../../_shared/studio-route";
import { studioCost, studioModel, studioTurnLlm, studioTurnStore } from "../../../_shared/studio-turn";

/**
 * POST /api/studio/conversations/[conversationId]/messages (design §7).
 *
 * Body `{ workspaceId, text, locationId? }`; `?locale=` selects the answer
 * language. The order is deliberate:
 *   flag → body → membership → location scope → rate limit → AI budget →
 *   conversation (404/409 archived) → per-conversation turn lock (409 busy) →
 *   briefing → `text/event-stream`.
 * Everything before the stream is a JSON error with the shared status mapping;
 * once the headers are sent a failure is an SSE `error` + `done` pair.
 *
 * One `assistant.run` audit row per settled turn records the intent and turn
 * kind only — never the message text, the answer or any evidence label.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function budgetFailure(decision: Extract<AiBudgetDecision, { allowed: false }>): Response {
  switch (decision.scope) {
    case "ai_paused":
      return studioError("ai_paused");
    case "ai_usage_unknown":
      return studioError("ai_unavailable");
    default:
      return studioError("ai_budget_reached");
  }
}

function jsonStatus(code: StudioErrorCode): Response {
  return studioError(code);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  if (!conversationStudioEnabled()) return studioDisabledResponse();

  const { conversationId: rawId } = await params;
  const conversationId = optionalUuid(rawId);
  if (!conversationId) return studioError("invalid_input");

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
  const locale = parseStudioLocale(request, body);
  const text = typeof body.text === "string" ? body.text.trim() : null;
  if (!workspaceId || locationId === null || locale === null || text === null || text.length < 1 || text.length > STUDIO_MESSAGE_MAX) {
    return studioError("invalid_input");
  }

  const auth = await authorizationOrUnavailable(() => authorizeWorkspaceRequest({ id: workspaceId }));
  if (!auth) return studioError("unavailable");
  if (!auth.ok) return authFailure(auth);
  const membership = auth.membership;
  if (locationId && !inLocationScope(membership, locationId)) return studioError("not_found");

  const decision = await enforceRateLimit({ req: request, scope: "studio_message", identifiers: [membership.userId], failClosed: true });
  if (!decision.allowed) return rateLimitedResponse(decision.retryAfterSeconds);

  const budget = await checkAiBudget(() => artifactRepository().aiSpend24h(membership.workspaceId), { entry: "assistant_draft" });
  if (!budget.allowed) return budgetFailure(budget);

  let repository: ReturnType<typeof studioRepository>;
  let conversation: Awaited<ReturnType<ReturnType<typeof studioRepository>["getConversation"]>>;
  try {
    repository = studioRepository();
    conversation = await repository.getConversation({ workspaceId: membership.workspaceId, actorId: membership.userId, conversationId });
  } catch {
    console.error("[api/studio/messages] failed", { category: "conversation_read_failed" });
    return jsonStatus("unavailable");
  }
  if (!conversation) return jsonStatus("not_found");
  if (conversation.status !== "active") return jsonStatus("archived");

  const effectiveLocationId = locationId ?? conversation.location_id;
  if (effectiveLocationId && !inLocationScope(membership, effectiveLocationId)) return jsonStatus("not_found");
  // The conversation must belong to the workspace the caller was authorised
  // for; the repository enforces that, and this restates it for the audit row.
  if (conversation.workspace_id !== membership.workspaceId) return jsonStatus("not_found");

  let release: Awaited<ReturnType<typeof acquireStudioTurnLock>>;
  try {
    release = await acquireStudioTurnLock(conversationId);
  } catch {
    console.error("[api/studio/messages] failed", { category: "turn_lock_unavailable" });
    return jsonStatus("unavailable");
  }
  if (!release) return jsonStatus("conversation_busy");

  let released = false;
  const releaseOnce = async (): Promise<void> => {
    if (released) return;
    released = true;
    try { await release!(); } catch { /* the turn outcome already decided the response */ }
  };

  let briefing: Awaited<ReturnType<typeof buildStudioBriefing>>;
  try {
    briefing = await buildStudioBriefing({ membership, locale, locationId: effectiveLocationId });
  } catch (error) {
    await releaseOnce();
    if (error instanceof AssistantAccessError) return studioError(error.code);
    console.error("[api/studio/messages] failed", { category: "briefing_failed" });
    return studioError("unavailable");
  }

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: StudioStreamEvent): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // The client went away mid-turn; keep the turn durable and close quietly.
          closed = true;
        }
      };
      try {
        const result = await runStudioTurn({
          membership,
          locale,
          conversationId,
          text,
          locationId: effectiveLocationId,
          db: studioTurnStore(repository),
          briefing,
          llm: studioTurnLlm(),
          emit,
          lock: async () => releaseOnce,
          cost: studioCost,
          model: studioModel(),
        });

        if (result.ok || result.persisted) {
          await recordNeonEvent({
            workspaceId: membership.workspaceId,
            locationId: effectiveLocationId,
            actorType: "user",
            actorId: membership.userId,
            event: "assistant.run",
            entityType: "conversation",
            entityId: conversationId,
            locale,
            ipHash: ipHashFor(request),
            // Enumerated values only: never the text, answer or evidence labels.
            payload: {
              surface: "studio",
              intent: result.intent ?? null,
              artifact: result.ok ? Boolean(result.artifact) : false,
              turn: result.turn ?? "chat",
            },
          });
        }

        if (!result.ok && !result.persisted) {
          // Nothing was written (a race with archive, a vanished conversation,
          // a second turn); the stream still ends in the documented pair.
          emit({ type: "error", code: result.code, message: studioErrorMessage(locale, result.code), retryable: isRetryableStudioError(result.code) });
          emit({ type: "done" });
        }
      } catch {
        emit({ type: "error", code: "unavailable", message: studioErrorMessage(locale, "unavailable"), retryable: true });
        emit({ type: "done" });
      } finally {
        await releaseOnce();
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    async cancel() {
      closed = true;
      await releaseOnce();
    },
  });

  return new Response(stream, { status: 200, headers: STUDIO_SSE_HEADERS });
}
