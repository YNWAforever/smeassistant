import { authorizeWorkspaceRequest, inLocationScope } from "@/lib/auth";
import { AssistantAccessError } from "@/lib/assistant/errors";
import { artifactRepository } from "@/lib/repositories/artifacts";
import { conversationSearchRepository } from "@/lib/repositories/conversation-search";
import { studioRepository } from "@/lib/repositories/studio";
import { checkAiBudget, type AiBudgetDecision } from "@/lib/budgets/ai";
import { authorizationOrUnavailable } from "@/lib/security/authorization-boundary";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { buildStudioBriefing } from "@/lib/studio/context";
import { isRetryableStudioError, studioErrorMessage } from "@/lib/studio/errors";
import { conversationStudioEnabled } from "@/lib/studio/flag";
import { runStudioTurn } from "@/lib/studio/orchestrator";
import type { StudioEvidenceContext } from "@/lib/studio/prompt";
import { acquireStudioTurnSession } from "@/lib/studio/turn-session";
import { runStudioRequest, type StudioRequestLifetime } from "@/lib/studio/request-lifetime";
import { BudgetExhausted, withExecutionBudget } from "@/lib/jobs/execution-budget";
import { runLiveAssistant } from "@/lib/assistant/live";
import { STUDIO_MESSAGE_MAX, type StudioCitationRef, type StudioErrorCode, type StudioStreamEvent } from "@/lib/studio/types";
import { ipHashFor, recordNeonEvent } from "@/lib/workspace/audit";
import { ConversationDocumentError, listConversationDocuments } from "@/lib/workspace/conversation-documents";
import type { SearchBrief } from "@/lib/workspace/search-gap";
import {
  STUDIO_SSE_HEADERS,
  authFailure,
  optionalUuid,
  parseStudioLocale,
  studioDisabledResponse,
  studioError,
} from "../../../_shared/studio-route";
import { studioCost, studioDraftPersistence, studioModel, studioTurnLlm, studioTurnStore } from "../../../_shared/studio-turn";

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

export function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  return runStudioRequest(lifetime => handlePost(request, params, lifetime), () => studioError("unavailable"));
}

async function handlePost(request: Request, params: Promise<{ conversationId: string }>, lifetime: StudioRequestLifetime): Promise<Response> {
  const { deadline } = lifetime;
  if (!conversationStudioEnabled()) return studioDisabledResponse();

  const { conversationId: rawId } = await lifetime.work(() => params);
  const conversationId = optionalUuid(rawId);
  if (!conversationId) return studioError("invalid_input");

  let payload: unknown;
  try {
    payload = await lifetime.work(() => request.json());
  } catch (error) {
    return studioError(error instanceof BudgetExhausted ? "unavailable" : "invalid_input");
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
  const rawDocumentIds = body.documentVersionIds;
  if (rawDocumentIds !== undefined && (!Array.isArray(rawDocumentIds) || rawDocumentIds.length > 5)) return studioError("invalid_input");
  const documentVersionIds = rawDocumentIds === undefined
    ? []
    : (rawDocumentIds as unknown[]).map((id) => optionalUuid(id));
  if (documentVersionIds.some((id) => id === null) || new Set(documentVersionIds).size !== documentVersionIds.length) {
    return studioError("invalid_input");
  }
  const rawBriefIds = body.searchBriefIds;
  if (rawBriefIds !== undefined && (!Array.isArray(rawBriefIds) || rawBriefIds.length > 3)) return studioError("invalid_input");
  const searchBriefIds = rawBriefIds === undefined
    ? []
    : (rawBriefIds as unknown[]).map((id) => optionalUuid(id));
  if (searchBriefIds.some((id) => id === null) || new Set(searchBriefIds).size !== searchBriefIds.length) {
    return studioError("invalid_input");
  }
  if (documentVersionIds.length + searchBriefIds.length > 5) return studioError("invalid_input");

  const auth = await lifetime.work(() => authorizationOrUnavailable(() => authorizeWorkspaceRequest({ id: workspaceId })));
  if (!auth) return studioError("unavailable");
  if (!auth.ok) return authFailure(auth);
  const membership = auth.membership;
  if (locationId && !inLocationScope(membership, locationId)) return studioError("not_found");

  const decision = await lifetime.work(() => enforceRateLimit({ req: request, scope: "studio_message", identifiers: [membership.userId], failClosed: true }));
  if (!decision.allowed) return rateLimitedResponse(decision.retryAfterSeconds);

  const budget = await lifetime.work(() => checkAiBudget(() => artifactRepository().aiSpend24h(membership.workspaceId), { entry: "assistant_draft" }));
  if (!budget.allowed) return budgetFailure(budget);

  let repository: ReturnType<typeof studioRepository>;
  let conversation: Awaited<ReturnType<ReturnType<typeof studioRepository>["getConversation"]>>;
  try {
    repository = studioRepository();
    conversation = await lifetime.work(() => repository.getConversation({ workspaceId: membership.workspaceId, actorId: membership.userId, conversationId }));
  } catch {
    console.error("[api/studio/messages] failed", { category: "conversation_read_failed" });
    return jsonStatus("unavailable");
  }
  if (!conversation) return jsonStatus("not_found");
  if (conversation.status !== "active") return jsonStatus("archived");
  if (conversation.access_role === "viewer") return jsonStatus("forbidden");

  const effectiveLocationId = locationId ?? conversation.location_id;
  if (effectiveLocationId && !inLocationScope(membership, effectiveLocationId)) return jsonStatus("not_found");
  // The conversation must belong to the workspace the caller was authorised
  // for; the repository enforces that, and this restates it for the audit row.
  if (conversation.workspace_id !== membership.workspaceId) return jsonStatus("not_found");

  // Attached workbench evidence (documents and approved search briefs) is
  // re-read here, in the same workspace/location scope as the conversation; the
  // text never travels through the browser and a missing/foreign item is
  // rejected before SSE.
  const documentScope = { workspaceId: membership.workspaceId, locationId: effectiveLocationId ?? null };
  const briefLocale = locale;
  const evidenceCache = new Map<string, StudioEvidenceContext>();
  const evidenceKey = (ref: StudioCitationRef): string =>
    ref.source === "document" ? `document:${ref.documentVersionId}` : `search_brief:${ref.searchBriefId}`;

  const searchBriefText = (brief: SearchBrief): string => [
    brief.title,
    `Missing: ${brief.missing}`,
    `Why it matters: ${brief.why}`,
    "Steps:",
    ...brief.steps.map((step, index) => `${index + 1}. ${step}`),
    `Citation: ${brief.citation}`,
  ].join("\n");

  async function loadEvidence(refs: StudioCitationRef[]): Promise<StudioEvidenceContext[]> {
    const documentIds = [...new Set(refs.filter((ref) => ref.source === "document").map((ref) => ref.documentVersionId))];
    const briefIds = [...new Set(refs.filter((ref) => ref.source === "search_brief").map((ref) => ref.searchBriefId))];
    const loaded: StudioEvidenceContext[] = [];
    if (documentIds.length) {
      const versions = await listConversationDocuments(documentScope, documentIds);
      const byId = new Map(versions.map((version) => [version.id, version]));
      for (const id of documentIds) {
        const version = byId.get(id);
        if (!version) throw new ConversationDocumentError("document_not_found");
        loaded.push({ source: "document", id: version.id, title: version.title, text: version.text, truncated: version.truncated });
      }
    }
    if (briefIds.length) {
      if (!effectiveLocationId) throw new Error("studio_search_brief_scope_missing");
      if (!briefLocale) throw new Error("studio_search_brief_locale_missing");
      const repository = conversationSearchRepository();
      for (const id of briefIds) {
        const record = await repository.find({ workspaceId: membership.workspaceId, locationId: effectiveLocationId }, id);
        const brief = record?.approvedAt && record.brief ? record.brief[briefLocale] : null;
        if (!brief) throw new Error("studio_search_brief_not_found");
        loaded.push({ source: "search_brief", id, title: brief.title, text: searchBriefText(brief), truncated: false });
      }
    }
    for (const context of loaded) evidenceCache.set(`${context.source}:${context.id}`, context);
    return loaded;
  }

  const evidenceRequests: StudioCitationRef[] = [
    ...(documentVersionIds as string[]).map((id): StudioCitationRef => ({ source: "document", documentVersionId: id, title: "", truncated: false })),
    ...(searchBriefIds as string[]).map((id): StudioCitationRef => ({ source: "search_brief", searchBriefId: id, title: "", truncated: false })),
  ];
  let evidenceRefs: StudioCitationRef[] = [];
  if (evidenceRequests.length) {
    try {
      const loaded = await lifetime.work(() => loadEvidence(evidenceRequests));
      evidenceRefs = loaded.map((context) => context.source === "document"
        ? { source: "document", documentVersionId: context.id, title: context.title, truncated: context.truncated }
        : { source: "search_brief", searchBriefId: context.id, title: context.title, truncated: context.truncated });
    } catch (error) {
      if (error instanceof ConversationDocumentError) return studioError(error.code === "document_not_found" ? "not_found" : "invalid_input");
      if (error instanceof Error && error.message === "studio_search_brief_not_found") return studioError("not_found");
      if (error instanceof Error && error.message === "studio_search_brief_scope_missing") return studioError("invalid_input");
      return jsonStatus("unavailable");
    }
  }

  let session: Awaited<ReturnType<typeof acquireStudioTurnSession>>;
  try {
    session = await acquireStudioTurnSession(conversationId, deadline);
  } catch {
    console.error("[api/studio/messages] failed", { category: "turn_lock_unavailable" });
    return jsonStatus("unavailable");
  }
  if (!session) return jsonStatus("conversation_busy");
  const turnSession = session;
  let releasing: Promise<void> | undefined;
  const releaseOnce = (): Promise<void> => releasing ??= turnSession.release().catch(() => {});
  lifetime.onFinally(releaseOnce);
  repository = studioRepository(turnSession.executor, turnSession.transaction);

  let briefing: Awaited<ReturnType<typeof buildStudioBriefing>>;
  try {
    briefing = await lifetime.work(() => buildStudioBriefing({ membership, locale, locationId: effectiveLocationId }));
  } catch (error) {
    await releaseOnce();
    if (error instanceof AssistantAccessError) return studioError(error.code);
    console.error("[api/studio/messages] failed", { category: "briefing_failed" });
    return studioError("unavailable");
  }

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const turn = async () => {
      let terminalSent = false;
      const emit = (event: StudioStreamEvent): void => {
        if (closed) return;
        if (event.type === "done") terminalSent = true;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // The client went away mid-turn; keep the turn durable and close quietly.
          closed = true;
        }
      };
      const closeAtDeadline = () => {
        if (!terminalSent) {
          emit({ type: "error", code: "unavailable", message: studioErrorMessage(locale, "unavailable"), retryable: true });
          emit({ type: "done" });
        }
        closed = true;
        try { controller.close(); } catch { /* delivery already closed */ }
      };
      deadline.finalization.signal.addEventListener("abort", closeAtDeadline, { once: true });
      try {
        const result = await runStudioTurn({
          membership,
          locale,
          conversationId,
          text,
          locationId: effectiveLocationId,
          db: studioTurnStore(repository, deadline),
          briefing,
          evidenceRefs,
          loadEvidence: async (refs) => {
            const missing = refs.filter((ref) => !evidenceCache.has(evidenceKey(ref)));
            if (missing.length) await lifetime.work(() => loadEvidence(missing));
            return refs.map((ref) => evidenceCache.get(evidenceKey(ref))).filter((context): context is StudioEvidenceContext => Boolean(context));
          },
          llm: studioTurnLlm(deadline.work),
          executionBudget: deadline.work,
          liveAssistant: input => runLiveAssistant({ ...input,
            executionBudget: deadline.work,
            persistence: studioDraftPersistence(turnSession, deadline),
            deferUsageSettlement: work => lifetime.completeWith(work),
          }),
          emit,
          // The route retains the real session through audit and cleanup.
          lock: async () => async () => {},
          cost: studioCost,
          model: studioModel(),
        });

        if (result.ok || result.persisted) {
          await withExecutionBudget(deadline.finalization, () => recordNeonEvent({
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
          }, turnSession.executor));
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
        // The lifetime drains deferred usage before releasing the real session.
        deadline.finalization.signal.removeEventListener("abort", closeAtDeadline);
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      }
      };
      const completion = turn();
      lifetime.completeWith(completion);
      return completion;
    },
    cancel() {
      // Disconnect stops delivery, not the durable turn. Its finally paths own
      // the lock until model work and message persistence have settled.
      closed = true;
    },
  });

  return new Response(stream, { status: 200, headers: STUDIO_SSE_HEADERS });
}
