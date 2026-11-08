import { llmChatDetailed, llmChatStreamDetailed, llmConfigured, type LLMChatMessage, type LLMStreamOutcome } from "../lib/llm";

/**
 * Studio gateway smoke check (docs/implementation/owner-platform-v1/CONVERSATION-STUDIO-CUTOVER.md).
 *
 * The browser acceptance suite runs against a fixture model, so it cannot prove
 * the deployed gateway accepts the Studio's two call shapes: a strict JSON
 * classifier completion and a streamed plain-text answer. This script performs
 * exactly those two calls with the configured gateway and exits non-zero on a
 * shape failure. It never touches the database; with no configured key it
 * reports SKIPPED and exits 0, so it is safe in any environment.
 *
 * Run after setting the deployment's LLM_* variables:
 *   corepack pnpm smoke:studio
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

function parseIntent(text: string): string | null {
  try {
    const value: unknown = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    return value && typeof value === "object" && !Array.isArray(value) && typeof (value as { intent?: unknown }).intent === "string"
      ? (value as { intent: string }).intent
      : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  if (!llmConfigured()) {
    console.log("SKIPPED: no LLM gateway is configured (set OPENCODE_API_KEY / LLM_API_KEY / OPENROUTER_KEY and optionally LLM_BASE_URL / LLM_MODEL).");
    return;
  }
  const startedAt = Date.now();

  const classifier = await llmChatDetailed(SMOKE_CLASSIFIER_MESSAGES, {
    jsonMode: true,
    maxTokens: 60,
    temperature: 0,
    timeoutMs: 20_000,
  });
  const classifierIntent = classifier.ok ? parseIntent(classifier.result.text) : null;

  const deltas: string[] = [];
  const stream = await llmChatStreamDetailed(SMOKE_ANSWER_MESSAGES, {
    maxTokens: 120,
    temperature: 0,
    timeoutMs: 30_000,
  }, (delta) => deltas.push(delta));

  const result = summarizeStudioSmoke({
    classifierOk: classifier.ok,
    classifierIntent,
    stream,
    deltas,
  });
  console.log(JSON.stringify({
    ok: result.ok,
    checks: result.checks,
    model: (process.env.LLM_MODEL ?? "").trim() || null,
    latencyMs: Date.now() - startedAt,
    classifier: classifier.ok
      ? { text: classifier.result.text.slice(0, 120), usage: classifier.result.usage }
      : { code: classifier.code },
    stream: stream.ok
      ? { streamed: stream.streamed, text: stream.result.text.slice(0, 120), deltas: deltas.length, usage: stream.result.usage }
      : { code: stream.code, streamed: stream.streamed, partialCharacters: (stream.text ?? "").length },
  }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

// Only run when invoked directly, so the test can import the pure helpers.
if (process.argv[1] && process.argv[1].replaceAll("\\", "/").endsWith("/scripts/studio-smoke.ts")) {
  await main();
}
