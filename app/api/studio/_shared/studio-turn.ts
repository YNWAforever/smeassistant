import { computeCostUsd } from "@/lib/agents/cost-model";
import { type LLMChatMessage, llmChatDetailed, llmChatStreamDetailed } from "@/lib/llm";
import { studioRepository, toStudioConversation, toStudioMessage } from "@/lib/repositories/studio";
import type { StudioTurnLlm, StudioTurnStore } from "@/lib/studio/orchestrator";
import { STUDIO_ANSWER_MAX_TOKENS, STUDIO_ANSWER_TEMPERATURE, STUDIO_ANSWER_TIMEOUT_MS, STUDIO_CLASSIFIER_MAX_TOKENS, STUDIO_CLASSIFIER_TEMPERATURE, STUDIO_CLASSIFIER_TIMEOUT_MS } from "@/lib/studio/prompt";
import type { StudioRepository } from "@/lib/repositories/studio";
import { withExecutionBudget, type ExecutionBudget } from "@/lib/jobs/execution-budget";
import type { StudioDeadline } from "@/lib/studio/deadline";
import type { StudioTurnSession } from "@/lib/studio/turn-session";
import { withinStudioBudget } from "@/lib/studio/request-lifetime";
import { actionRunRepository } from "@/lib/repositories/artifacts";

/**
 * Production adapters for the orchestrator's injected capabilities (design §6).
 *
 * The orchestrator itself is pure: it never imports the database or the LLM
 * wrapper. These two small mappings are the only place the real repository and
 * the real gateway meet a turn, which is what keeps every branch unit-testable.
 */

/** Repository rows are DB-shaped; the orchestrator speaks the wire contract. */
export function studioTurnStore(repository: StudioRepository = studioRepository(), deadline?: StudioDeadline): StudioTurnStore {
  const read = <T>(run: () => Promise<T>) => deadline
    ? withinStudioBudget(deadline.work, () => withExecutionBudget(deadline.work, run)) : run();
  return {
    getConversation: async (args) => {
      const row = await read(() => repository.getConversation(args));
      return row ? toStudioConversation(row) : null;
    },
    listMessages: async (args) => (await read(() => repository.listMessages(args))).map(toStudioMessage),
    renameConversation: async (args) => {
      const row = await read(() => repository.renameConversation(args));
      return row ? toStudioConversation(row) : null;
    },
    appendMessage: async (args) => {
      const result = await (deadline
        ? withExecutionBudget(args.role === "assistant" ? deadline.finalization : deadline.work, () => repository.appendMessage(args))
        : repository.appendMessage(args));
      return { message: toStudioMessage(result.message), conversation: toStudioConversation(result.conversation) };
    },
  };
}

const CLASSIFIER_OPTIONS = {
  jsonMode: true,
  maxTokens: STUDIO_CLASSIFIER_MAX_TOKENS,
  temperature: STUDIO_CLASSIFIER_TEMPERATURE,
  timeoutMs: STUDIO_CLASSIFIER_TIMEOUT_MS,
} as const;

const ANSWER_OPTIONS = {
  maxTokens: STUDIO_ANSWER_MAX_TOKENS,
  temperature: STUDIO_ANSWER_TEMPERATURE,
  timeoutMs: STUDIO_ANSWER_TIMEOUT_MS,
} as const;

export function studioTurnLlm(executionBudget?: ExecutionBudget): StudioTurnLlm {
  return {
    classify: (messages: LLMChatMessage[]) => llmChatDetailed(messages, executionBudget ? { ...CLASSIFIER_OPTIONS, executionBudget } : CLASSIFIER_OPTIONS),
    // A non-streaming fallback returns `streamed: false`; the orchestrator still
    // emits the complete text as the final message, never as deltas.
    answer: (messages: LLMChatMessage[], onDelta?: (delta: string) => void) =>
      llmChatStreamDetailed(messages, executionBudget ? { ...ANSWER_OPTIONS, executionBudget } : ANSWER_OPTIONS, onDelta ?? (() => {})),
  };
}

/** All draft accounting and terminal writes share the lock-owning session. */
export function studioDraftPersistence(session: StudioTurnSession, deadline: StudioDeadline) {
  const repository = actionRunRepository(session.transaction);
  const scoped = <Args extends unknown[], Result>(budget: ExecutionBudget, run: (...args: Args) => Promise<Result>) =>
    (...args: Args) => withExecutionBudget(budget, () => run(...args));
  return {
    queue: scoped(deadline.work, repository.queue),
    start: scoped(deadline.work, repository.start),
    beginProviderAttempt: scoped(deadline.work, repository.beginProviderAttempt),
    observeProviderAttempt: scoped(deadline.finalization, repository.observeProviderAttempt),
    finishAssistantDraft: scoped(deadline.finalization, repository.finishAssistantDraft),
  };
}

/** Model label stored on the message; null when the gateway default is in use. */
export function studioModel(): string | null {
  const model = (process.env.LLM_MODEL ?? "").trim();
  return model || null;
}

/** Cost is computed at the route boundary because `computeCostUsd` reads the environment. */
export function studioCost(usage: { inputTokens: number | null; outputTokens: number | null }): number | null {
  return computeCostUsd(usage, studioModel());
}
