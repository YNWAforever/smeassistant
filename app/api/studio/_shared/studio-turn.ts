import { computeCostUsd } from "@/lib/agents/cost-model";
import { type LLMChatMessage, llmChatDetailed, llmChatStreamDetailed } from "@/lib/llm";
import { studioRepository, toStudioConversation, toStudioMessage } from "@/lib/repositories/studio";
import type { StudioTurnLlm, StudioTurnStore } from "@/lib/studio/orchestrator";
import { STUDIO_ANSWER_MAX_TOKENS, STUDIO_ANSWER_TEMPERATURE, STUDIO_ANSWER_TIMEOUT_MS, STUDIO_CLASSIFIER_MAX_TOKENS, STUDIO_CLASSIFIER_TEMPERATURE, STUDIO_CLASSIFIER_TIMEOUT_MS } from "@/lib/studio/prompt";
import type { StudioRepository } from "@/lib/repositories/studio";

/**
 * Production adapters for the orchestrator's injected capabilities (design §6).
 *
 * The orchestrator itself is pure: it never imports the database or the LLM
 * wrapper. These two small mappings are the only place the real repository and
 * the real gateway meet a turn, which is what keeps every branch unit-testable.
 */

/** Repository rows are DB-shaped; the orchestrator speaks the wire contract. */
export function studioTurnStore(repository: StudioRepository = studioRepository()): StudioTurnStore {
  return {
    getConversation: async (args) => {
      const row = await repository.getConversation(args);
      return row ? toStudioConversation(row) : null;
    },
    listMessages: async (args) => (await repository.listMessages(args)).map(toStudioMessage),
    renameConversation: async (args) => {
      const row = await repository.renameConversation(args);
      return row ? toStudioConversation(row) : null;
    },
    appendMessage: async (args) => {
      const result = await repository.appendMessage(args);
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

export function studioTurnLlm(): StudioTurnLlm {
  return {
    classify: (messages: LLMChatMessage[]) => llmChatDetailed(messages, CLASSIFIER_OPTIONS),
    // A non-streaming fallback returns `streamed: false`; the orchestrator still
    // emits the complete text as the final message, never as deltas.
    answer: (messages: LLMChatMessage[], onDelta?: (delta: string) => void) =>
      llmChatStreamDetailed(messages, ANSWER_OPTIONS, onDelta ?? (() => {})),
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
