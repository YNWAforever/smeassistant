import type { LLMChatMessage, LLMStreamOutcome } from "@/lib/llm";

/**
 * The two gateway call shapes the Studio uses, shared by the operator CLI
 * (`scripts/studio-smoke.ts`) and the production health endpoint
 * (`app/api/ops/studio-health/route.ts`). Pure: no network, no env.
 */

export const SMOKE_CLASSIFIER_MESSAGES: LLMChatMessage[] = [
  { role: "system", content: "You are a connectivity probe. Return one JSON object and nothing else." },
  { role: "user", content: 'Return exactly {"intent":"answer"} and no other keys.' },
];

export const SMOKE_ANSWER_MESSAGES: LLMChatMessage[] = [
  { role: "system", content: "You are a connectivity probe. Reply in one short sentence." },
  { role: "user", content: "Say that the Studio gateway is reachable." },
];

export interface StudioSmokeInput {
  classifierOk: boolean;
  /** Parsed intent from the classifier completion, or null when it did not parse. */
  classifierIntent: string | null;
  stream: LLMStreamOutcome;
  /** The deltas the stream emitted, in order. */
  deltas: readonly string[];
}

export interface StudioSmokeResult {
  ok: boolean;
  checks: {
    classifierCompleted: boolean;
    classifierJsonParsed: boolean;
    classifierIntentAnswer: boolean;
    streamCompleted: boolean;
    streamUsedDeltas: boolean;
    streamTextNonEmpty: boolean;
    deltasMatchText: boolean;
  };
}

/**
 * Pure verdict for the two calls: every check is reported even when a later one
 * cannot pass, so an operator sees the first failing shape in the output.
 */
export function summarizeStudioSmoke(input: StudioSmokeInput): StudioSmokeResult {
  const checks = {
    classifierCompleted: input.classifierOk,
    classifierJsonParsed: input.classifierIntent !== null,
    classifierIntentAnswer: input.classifierIntent === "answer",
    streamCompleted: input.stream.ok,
    streamUsedDeltas: input.stream.ok && input.stream.streamed === true,
    streamTextNonEmpty: input.stream.ok && input.stream.result.text.trim().length > 0,
    deltasMatchText: input.stream.ok && input.deltas.join("") === input.stream.result.text,
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

export function parseStudioSmokeIntent(text: string): string | null {
  try {
    const value: unknown = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    return value && typeof value === "object" && !Array.isArray(value) && typeof (value as { intent?: unknown }).intent === "string"
      ? (value as { intent: string }).intent
      : null;
  } catch {
    return null;
  }
}
