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

import {
  SMOKE_ANSWER_MESSAGES,
  SMOKE_CLASSIFIER_MESSAGES,
  parseStudioSmokeIntent,
  summarizeStudioSmoke,
  type StudioSmokeInput,
  type StudioSmokeResult,
} from "../lib/studio/smoke";

export {
  SMOKE_ANSWER_MESSAGES,
  SMOKE_CLASSIFIER_MESSAGES,
  summarizeStudioSmoke,
  type StudioSmokeInput,
  type StudioSmokeResult,
} from "../lib/studio/smoke";

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
  const classifierIntent = classifier.ok ? parseStudioSmokeIntent(classifier.result.text) : null;

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
