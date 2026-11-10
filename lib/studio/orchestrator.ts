import type { Membership } from "@/lib/auth";
import { AssistantAccessError } from "@/lib/assistant/errors";
import { runLiveAssistant, type LiveRunInput } from "@/lib/assistant/live";
import { fallbackIntentFor } from "@/lib/assistant/templates";
import { AiBudgetRefusal, type AiBudgetDecision } from "@/lib/budgets/ai";
import type { PrototypeLocale } from "@/lib/copy";
import type { LLMChatMessage, LLMStreamOutcome, LLMUsage } from "@/lib/llm";
import type { AssistantIntentId, DemoAssistantRunResponse, EvidenceReference } from "@/lib/pocket-assistant/contracts";
import { studioText } from "./copy";
import type { StudioBriefingResult } from "./context";
import {
  parseStudioClassification,
  resolveEvidenceCatalogue,
  studioAnswerMessages,
  studioClassificationIntentId,
  studioClassifierMessages,
  studioTurnKind,
  STUDIO_PROMPT_VERSION,
  type StudioClassification,
  type StudioEvidenceContext,
  type StudioTurnKind,
} from "./prompt";
import {
  STUDIO_HISTORY_TURNS,
  STUDIO_MESSAGE_MAX,
  STUDIO_TITLE_MAX,
  type StudioConversation,
  type StudioCitationRef,
  type StudioErrorCode,
  type StudioMessage,
  type StudioMessagePart,
  type StudioMessageRole,
  type StudioStreamEvent,
} from "./types";
import type { StudioTurnRelease } from "./turn-lock";

/**
 * One Studio turn (design §6). Pure dependency injection: the store, the LLM,
 * the live assistant, the budget decision, the clock and the cost read are all
 * passed in, so every branch is unit-testable without a provider, a database or
 * `process.env`.
 *
 * Failure contract:
 *  - Before the user message is persisted (missing/foreign/archived
 *    conversation, busy lock, budget or pause refusal) nothing is written: the
 *    route has not sent SSE headers yet and answers a JSON error.
 *  - After it is persisted the thread must stay continuous: the orchestrator
 *    stores a localized assistant warning message, emits `message` then `done`
 *    and returns `{ ok: false, persisted: true, code }`.
 *  - A failure that occurs before any frame: `{ ok: false, persisted: false }`
 *    and no `done`; the route emits `error` + `done`.
 */

/** A stored message, already mapped to the wire contract by the caller's adapter. */
export interface StudioTurnStore {
  getConversation(args: { workspaceId: string; actorId: string; conversationId: string }): Promise<StudioConversation | null>;
  listMessages?(
    args: { workspaceId: string; actorId: string; conversationId: string; limit?: number; beforeSeq?: number },
  ): Promise<StudioMessage[]>;
  /**
   * Applies the classifier's first-turn title (v1.1). Optional: without it the
   * deterministic first-message title already stored by `appendMessage` stays.
   */
  renameConversation?(args: { workspaceId: string; actorId: string; conversationId: string; title: string }): Promise<StudioConversation | null>;
  appendMessage(args: StudioAppendMessageInput): Promise<{ message: StudioMessage; conversation: StudioConversation }>;
}

export interface StudioAppendMessageInput {
  workspaceId: string;
  actorId: string;
  conversationId: string;
  role: StudioMessageRole;
  content: string;
  parts: StudioMessagePart[];
  intent?: AssistantIntentId | null;
  model?: string | null;
  promptVersion?: string | null;
  usage?: { inputTokens: number | null; outputTokens: number | null; costUsd: number | null } | null;
  /** Only honoured while the stored conversation title is still empty (first user turn). */
  titleSuggestion?: string;
}

/** The two model calls a turn can make, injected by the route's production wrapper. */
export interface StudioTurnLlm {
  classify(messages: LLMChatMessage[]): Promise<{ ok: true; result: { text: string; usage: LLMUsage } } | { ok: false; code: string }>;
  answer(messages: LLMChatMessage[], onDelta?: (delta: string) => void): Promise<LLMStreamOutcome>;
}

export type StudioTurnLiveAssistant = (input: LiveRunInput) => Promise<DemoAssistantRunResponse>;

export type StudioTurnEmit = (event: StudioStreamEvent) => void | Promise<void>;

export type StudioTurnResult =
  | { ok: true; intent: AssistantIntentId | null; turn: StudioTurnKind; artifact: boolean }
  | { ok: false; code: StudioErrorCode; persisted: boolean; intent?: AssistantIntentId | null; turn?: StudioTurnKind };

export interface StudioTurnInput {
  membership: Membership;
  locale: PrototypeLocale;
  conversationId: string;
  text: string;
  locationId?: string | null;
  db: StudioTurnStore;
  /** `buildStudioBriefing` result: authorised rows and the rendered system block. */
  briefing: StudioBriefingResult;
  /** Workbench items the owner attached to this turn (documents/briefs). */
  evidenceRefs?: StudioCitationRef[];
  /**
   * Re-reads authorised evidence text for the turns being answered. The route
   * injects it so the orchestrator never imports a database or storage module;
   * a failure degrades to a normal grounded answer.
   */
  loadEvidence?: (refs: StudioCitationRef[]) => Promise<StudioEvidenceContext[]>;
  llm: StudioTurnLlm;
  liveAssistant?: StudioTurnLiveAssistant;
  emit: StudioTurnEmit;
  /** The route acquires the advisory lock before SSE; the orchestrator releases it in `finally`. */
  lock?: () => Promise<StudioTurnRelease | null>;
  /** Optional defensive re-check; the route already checked the budget before streaming. */
  budget?: () => Promise<AiBudgetDecision>;
  /** Injected because `computeCostUsd` reads the ambient environment. */
  cost?: (usage: LLMUsage) => number | null;
  model?: string | null;
  now?: () => Date;
}

const HISTORY_MESSAGE_MAX = 600;

function budgetCode(decision: Extract<AiBudgetDecision, { allowed: false }>): StudioErrorCode {
  switch (decision.scope) {
    case "ai_paused":
      return "ai_paused";
    case "ai_usage_unknown":
      return "ai_unavailable";
    default:
      return "ai_budget_reached";
  }
}

/** Provider/transport failures all read as "the AI provider is unavailable" to the owner. */
function llmFailureCode(code: string): StudioErrorCode {
  if (code === "ai_paused") return "ai_paused";
  return "ai_unavailable";
}

function isMissingConversation(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message === "studio_conversation_not_found"
      || error.name === "StudioConversationNotFoundError"
      || error.name === "StudioConversationMissingError";
  }
  return false;
}

/**
 * A turn can lose the race it passed its own pre-checks against: another
 * request archives the conversation between the route's read and this append.
 * The repository's typed errors are recognised by their stable name/message so
 * the orchestrator stays free of a database import.
 */
function appendFailureCode(error: unknown): StudioErrorCode | null {
  if (!(error instanceof Error)) return null;
  if (isMissingConversation(error)) return "not_found";
  if (error.message === "studio_conversation_archived" || error.name === "StudioConversationArchivedError") return "archived";
  return null;
}

function titleSuggestion(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.slice(0, STUDIO_TITLE_MAX);
}

function historyOf(messages: StudioMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-STUDIO_HISTORY_TURNS)
    .map((message) => ({
      role: message.role,
      content: message.content.length > HISTORY_MESSAGE_MAX ? `${message.content.slice(0, HISTORY_MESSAGE_MAX)}…` : message.content,
    }));
}

/** Collects delta emissions so they keep their order before the finishing frame. */
function createEmitter(emit: StudioTurnEmit) {
  const pending: Array<Promise<void>> = [];
  return {
    async send(event: StudioStreamEvent): Promise<void> {
      await emit(event);
    },
    sendDelta(text: string): void {
      const result = emit({ type: "delta", text });
      if (result && typeof (result as Promise<void>).then === "function") pending.push(result as Promise<void>);
    },
    async flush(): Promise<void> {
      while (pending.length) await pending.shift();
    },
  };
}

export async function runStudioTurn(input: StudioTurnInput): Promise<StudioTurnResult> {
  const { membership, locale, conversationId, db, briefing } = input;
  const workspaceId = membership.workspaceId;
  const actorId = membership.userId;
  const text = input.text.trim().slice(0, STUDIO_MESSAGE_MAX);
  const copy = studioText(locale);
  const emitter = createEmitter(input.emit);
  const cost = (usage: LLMUsage): number | null => (input.cost ? input.cost(usage) : null);

  let release: StudioTurnRelease | null = null;
  if (input.lock) {
    release = await input.lock();
    if (!release) return { ok: false, code: "conversation_busy", persisted: false };
  }

  try {
    if (input.budget) {
      const decision = await input.budget();
      if (!decision.allowed) return { ok: false, code: budgetCode(decision), persisted: false };
    }

    const conversation = await db.getConversation({ workspaceId, actorId, conversationId });
    if (!conversation) return { ok: false, code: "not_found", persisted: false };
    if (conversation.status !== "active") return { ok: false, code: "archived", persisted: false };

    // History is read before the new turn is appended so the model sees the
    // conversation up to (not including) this message.
    let historyMessages: StudioMessage[] = [];
    if (db.listMessages) {
      try {
        historyMessages = await db.listMessages({ workspaceId, actorId, conversationId, limit: STUDIO_HISTORY_TURNS });
      } catch {
        // A history read failure is not worth failing a turn the owner just
        // asked for; the briefing alone still grounds the answer.
        historyMessages = [];
      }
    }
    const history = historyOf(historyMessages);
    // Documents and search briefs attached to an earlier turn are re-read from
    // the same authorised scope each turn, so a revoked item cannot be replayed
    // from the thread.
    const evidenceRefs = new Map<string, StudioCitationRef>();
    const refKey = (ref: StudioCitationRef): string =>
      ref.source === "document" ? `document:${ref.documentVersionId}` : `search_brief:${ref.searchBriefId}`;
    for (const message of historyMessages) {
      for (const part of message.parts) {
        if (part.kind !== "citation") continue;
        for (const ref of part.refs) if (!evidenceRefs.has(refKey(ref))) evidenceRefs.set(refKey(ref), ref);
      }
    }
    for (const ref of input.evidenceRefs ?? []) if (!evidenceRefs.has(refKey(ref))) evidenceRefs.set(refKey(ref), ref);
    const evidenceToLoad = [...evidenceRefs.values()].slice(0, 8);
    let documents: StudioEvidenceContext[] = [];
    if (input.loadEvidence && evidenceToLoad.length) {
      try { documents = await input.loadEvidence(evidenceToLoad); } catch { documents = []; }
    }

    await emitter.send({ type: "status", stage: "reading" });

    const userParts: StudioMessagePart[] = [{ kind: "text", text }];
    if (input.evidenceRefs?.length) userParts.push({ kind: "citation", refs: input.evidenceRefs });

    let userMessage: StudioMessage;
    try {
      userMessage = (await db.appendMessage({
        workspaceId,
        actorId,
        conversationId,
        role: "user",
        content: text,
        parts: userParts,
        titleSuggestion: titleSuggestion(text),
      })).message;
    } catch (error) {
      const code = appendFailureCode(error);
      if (code) return { ok: false, code, persisted: false };
      throw error;
    }
    await emitter.send({ type: "user", message: userMessage });

    const allowedActionIds = briefing.briefing.openActions.map((action) => action.id);
    const allowedVersionIds = briefing.briefing.waitingVersions.map((version) => version.id);
    const allowedEvidenceIds = briefing.evidenceCatalogue.map((entry) => entry.id);
    const allowlist = { allowedEvidenceIds, allowedActionIds, allowedVersionIds };
    const evidenceById = new Map<string, EvidenceReference>(briefing.evidenceCatalogue.map((entry) => [entry.id, entry.ref]));

    let classification: StudioClassification = { intent: "answer", evidenceIds: [], nextStep: null };
    const firstTurn = history.length === 0;
    const classifierMessages = studioClassifierMessages({
      locale,
      systemBriefing: briefing.systemBriefing,
      message: text,
      allowedEvidenceIds,
      allowedActions: briefing.briefing.openActions.map((action) => ({
        id: action.id,
        title: action.title,
        state: action.state,
        missingInputs: action.missingInputs,
      })),
      allowedVersions: briefing.briefing.waitingVersions.map((version) => ({ id: version.id, actionId: version.actionId, versionNo: version.versionNo })),
      firstTurn,
    });
    // The classifier is a small best-effort JSON call; a transient provider
    // failure must not silently lose the conversation title/intent. Retry once
    // before the documented grounded-answer fallback.
    let classifierOutcome: Awaited<ReturnType<StudioTurnLlm["classify"]>> | null = null;
    try {
      classifierOutcome = await input.llm.classify(classifierMessages);
      if (!classifierOutcome.ok) classifierOutcome = await input.llm.classify(classifierMessages);
    } catch {
      try { classifierOutcome = await input.llm.classify(classifierMessages); } catch { classifierOutcome = null; }
    }
    if (classifierOutcome?.ok) classification = parseStudioClassification(classifierOutcome.result.text, allowlist);

    // v1.1: the first turn may name the conversation. This is cosmetic and must
    // never fail the turn; the deterministic first-message title is the fallback.
    if (firstTurn && classification.title && db.renameConversation) {
      try {
        await db.renameConversation({ workspaceId, actorId, conversationId, title: classification.title });
      } catch {
        // Keep the deterministic title.
      }
    }

    if (classification.intent === "answer") {
      return await executeAnswer({
        input, emitter, db, conversationId, workspaceId, actorId, locale, text, history, documents,
        classification, evidenceById, cost, copy,
      });
    }
    return await executeLive({
      input, emitter, db, conversationId, workspaceId, actorId, locale,
      classification, evidenceById, cost, copy,
    });
  } finally {
    if (release) await release();
  }
}

interface ExecuteCommon {
  input: StudioTurnInput;
  emitter: ReturnType<typeof createEmitter>;
  db: StudioTurnStore;
  conversationId: string;
  workspaceId: string;
  actorId: string;
  locale: PrototypeLocale;
  evidenceById: Map<string, EvidenceReference>;
  cost: (usage: LLMUsage) => number | null;
  copy: ReturnType<typeof studioText>;
}

function evidencePart(classification: Extract<StudioClassification, { evidenceIds: string[] }>, evidenceById: Map<string, EvidenceReference>): StudioMessagePart[] {
  const refs = resolveEvidenceCatalogue(classification.evidenceIds, Object.fromEntries(evidenceById));
  return refs.length ? [{ kind: "evidence", refs }] : [];
}

function nextStepPart(classification: StudioClassification): StudioMessagePart[] {
  return classification.nextStep ? [{ kind: "next_step", step: classification.nextStep }] : [];
}

/** Persist the assistant message and emit the closing frames; returns the result. */
async function persistAndEmit(
  common: Pick<ExecuteCommon, "input" | "emitter" | "db" | "conversationId" | "workspaceId" | "actorId" | "cost">,
  message: { content: string; parts: StudioMessagePart[]; intent: AssistantIntentId | null; usage: LLMUsage | null },
  outcome: { ok: true; intent: AssistantIntentId | null; turn: StudioTurnKind; artifact: boolean } | { ok: false; code: StudioErrorCode; turn: StudioTurnKind },
): Promise<StudioTurnResult> {
  const { input, emitter, db, conversationId, workspaceId, actorId } = common;
  await emitter.flush();
  await emitter.send({ type: "status", stage: "finishing" });
  let stored: { message: StudioMessage; conversation: StudioConversation };
  try {
    stored = await db.appendMessage({
      workspaceId,
      actorId,
      conversationId,
      role: "assistant",
      content: message.content,
      parts: message.parts,
      intent: message.intent,
      model: input.model ?? null,
      promptVersion: STUDIO_PROMPT_VERSION,
      usage: message.usage
        ? { inputTokens: message.usage.inputTokens, outputTokens: message.usage.outputTokens, costUsd: common.cost(message.usage) }
        : null,
    });
  } catch (error) {
    // The user turn is already stored. The route turns this into an honest
    // in-stream error; nothing further can be persisted.
    void error;
    return { ok: false, code: "unavailable", persisted: false };
  }
  await emitter.send({ type: "message", message: stored.message, conversation: stored.conversation });
  await emitter.send({ type: "done" });
  return outcome.ok
    ? { ok: true, intent: outcome.intent, turn: outcome.turn, artifact: outcome.artifact }
    : { ok: false, code: outcome.code, persisted: true, intent: message.intent, turn: outcome.turn };
}

interface AnswerInput extends ExecuteCommon {
  text: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  documents: StudioEvidenceContext[];
  classification: Extract<StudioClassification, { intent: "answer" }>;
}

async function executeAnswer(args: AnswerInput): Promise<StudioTurnResult> {
  const { input, emitter, classification, evidenceById, copy, locale } = args;
  await emitter.send({ type: "status", stage: "thinking" });
  const messages = studioAnswerMessages({
    locale,
    systemBriefing: input.briefing.systemBriefing,
    history: args.history,
    message: args.text,
    documents: args.documents,
  });
  let outcome: LLMStreamOutcome;
  try {
    outcome = await input.llm.answer(messages, (delta) => emitter.sendDelta(delta));
  } catch {
    outcome = { ok: false, code: "network_error", retryable: true };
  }

  if (outcome.ok) {
    const parts: StudioMessagePart[] = [
      { kind: "text", text: outcome.result.text },
      ...evidencePart(classification, evidenceById),
      ...nextStepPart(classification),
    ];
    return persistAndEmit(args, {
      content: outcome.result.text,
      parts,
      intent: null,
      usage: outcome.result.usage,
    }, { ok: true, intent: null, turn: "chat", artifact: false });
  }

  // Post-persistence provider failure: keep the thread continuous and honest.
  const notice = copy.notices.failed;
  const partial = typeof outcome.text === "string" && outcome.text.trim() ? outcome.text.trim() : null;
  const content = partial ? `${partial}\n\n${notice}` : notice;
  const warningCode = outcome.code === "stream_interrupted" ? "stream_interrupted" : "ai_unavailable";
  const parts: StudioMessagePart[] = [
    { kind: "text", text: content },
    { kind: "warning", code: warningCode, text: outcome.code === "ai_paused" ? copy.errors.ai_paused : notice },
  ];
  return persistAndEmit(args, {
    content,
    parts,
    intent: null,
    usage: outcome.usage ?? null,
  }, { ok: false, code: llmFailureCode(outcome.code), turn: "chat" });
}

interface LiveInput extends ExecuteCommon {
  classification: Exclude<StudioClassification, { intent: "answer" }>;
}

function artifactPart(
  result: DemoAssistantRunResponse,
  classification: Exclude<StudioClassification, { intent: "answer" }>,
  briefing: StudioBriefingResult["briefing"],
): StudioMessagePart | null {
  const output = result.output;
  if (!output) return null;
  const actionId = classification.actionId;
  if (!actionId) return null;
  const actionTitle = briefing.openActions.find((action) => action.id === actionId)?.title ?? output.title;
  return {
    kind: "artifact",
    actionId,
    actionTitle,
    artifactType: output.type,
    title: output.title,
    body: output.body,
    acceptanceCriteria: [...output.acceptanceCriteria],
    draftRunId: result.draftRunId ?? null,
    requiresApproval: true,
    revisedFromVersionId: classification.intent === "draft" ? classification.versionId : null,
  };
}

function liveParts(
  result: DemoAssistantRunResponse,
  classification: Exclude<StudioClassification, { intent: "answer" }>,
  briefing: StudioBriefingResult["briefing"],
): StudioMessagePart[] {
  const refs = result.evidenceRefs.slice(0, 4);
  const parts: StudioMessagePart[] = [{ kind: "text", text: result.answer }];
  if (refs.length) parts.push({ kind: "evidence", refs });
  const artifact = artifactPart(result, classification, briefing);
  if (artifact) parts.push(artifact);
  if (result.nextStep) parts.push({ kind: "next_step", step: result.nextStep });
  for (const warning of result.warnings) parts.push({ kind: "warning", code: "assistant_warning", text: warning });
  return parts;
}

/** Build the live-assistant context from the classifier's allowlisted ids only. */
function liveContext(args: LiveInput): LiveRunInput["context"] {
  const { input, classification } = args;
  return {
    workspaceId: input.membership.workspaceId,
    ...(input.locationId ? { locationId: input.locationId } : {}),
    ...(classification.actionId ? { actionId: classification.actionId } : {}),
    ...(classification.versionId ? { versionId: classification.versionId } : {}),
  };
}

async function executeLive(args: LiveInput): Promise<StudioTurnResult> {
  const { input, emitter, classification, copy, locale } = args;
  const live = input.liveAssistant ?? runLiveAssistant;
  await emitter.send({ type: "status", stage: "drafting" });

  try {
    const result = await live({
      intentId: classification.intentId,
      surface: "studio",
      locale,
      context: liveContext(args),
      membership: input.membership,
      contextual: true,
    });
    const parts = liveParts(result, classification, input.briefing.briefing);
    return persistAndEmit(args, {
      content: result.answer,
      parts,
      intent: studioClassificationIntentId(classification),
      usage: null,
    }, { ok: true, intent: studioClassificationIntentId(classification), turn: studioTurnKind(classification), artifact: Boolean(result.output) });
  } catch (error) {
    // A viewer asking for a draft: runLiveAssistant's manager floor refused it.
    // Show the deterministic answer for the equivalent explain intent plus the
    // role boundary, so the thread stays useful without granting anything.
    if (error instanceof AssistantAccessError && error.code === "forbidden" && classification.intent === "draft") {
      return await refusalFallback(args);
    }
    if (error instanceof AiBudgetRefusal) {
      const code = error.code === "ai_paused" ? "ai_paused" : error.code === "provider_usage_pending" ? "ai_unavailable" : "ai_budget_reached";
      return storedFailure(args, code, copy.errors[code]);
    }
    if (error instanceof AssistantAccessError) {
      const code: StudioErrorCode = error.code;
      return storedFailure(args, code, copy.errors[code]);
    }
    return storedFailure(args, "unavailable", copy.errors.unavailable);
  }
}

async function refusalFallback(args: LiveInput): Promise<StudioTurnResult> {
  const { input, classification, copy, locale } = args;
  const live = input.liveAssistant ?? runLiveAssistant;
  const classificationDraft = classification as Extract<StudioClassification, { intent: "draft" }>;
  try {
    const fallback = await live({
      intentId: fallbackIntentFor(classificationDraft.intentId),
      surface: "studio",
      locale,
      context: { workspaceId: input.membership.workspaceId, ...(input.locationId ? { locationId: input.locationId } : {}) },
      membership: input.membership,
      contextual: true,
    });
    const notice = copy.notices.viewer;
    const content = `${fallback.answer}\n\n${notice}`;
    const parts: StudioMessagePart[] = [
      { kind: "text", text: content },
      ...(fallback.evidenceRefs.length ? [{ kind: "evidence" as const, refs: fallback.evidenceRefs.slice(0, 4) }] : []),
      { kind: "warning", code: "viewer_draft_refused", text: notice },
    ];
    if (fallback.nextStep) parts.push({ kind: "next_step", step: fallback.nextStep });
    return persistAndEmit(args, { content, parts, intent: null, usage: null }, {
      ok: false, code: "forbidden", turn: "draft",
    });
  } catch {
    return storedFailure(args, "unavailable", copy.errors.unavailable);
  }
}

/** Persist an assistant warning so a post-persistence failure is visible and retryable. */
async function storedFailure(args: LiveInput, code: StudioErrorCode, notice: string): Promise<StudioTurnResult> {
  const { copy } = args;
  const content = `${copy.notices.failed}\n\n${notice}`;
  const parts: StudioMessagePart[] = [
    { kind: "text", text: content },
    { kind: "warning", code: code, text: notice },
  ];
  return persistAndEmit(args, { content, parts, intent: null, usage: null }, {
    ok: false, code, turn: studioTurnKind(args.classification),
  });
}
