import { llmChatDetailed, llmChatStreamDetailed, llmConfigured } from "@/lib/llm";
import {
  SMOKE_ANSWER_MESSAGES,
  SMOKE_CLASSIFIER_MESSAGES,
  parseStudioSmokeIntent,
  summarizeStudioSmoke,
} from "@/lib/studio/smoke";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Operator-gated production smoke probe for the Studio's real gateway
 * (POST /api/ops/studio-health, `Authorization: Bearer $STUDIO_HEALTH_TOKEN`).
 *
 * It performs exactly the two call shapes a Studio turn uses — strict JSON
 * classifier and streamed answer — using the deployment's own LLM_* variables.
 * It prints no prompt/answer text, touches no database and returns 404 unless
 * the token matches, so it cannot be used to generate free content.
 *
 * Run after changing LLM_MODEL / LLM_BASE_URL / provider keys. The response is
 * `{ ok, model, latencyMs, checks, classifier: {ok, code?}, stream: {...} }`.
 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const expected = (process.env.STUDIO_HEALTH_TOKEN ?? "").trim();
  const supplied = request.headers.get("authorization") ?? "";
  if (!expected || supplied !== `Bearer ${expected}`) return new Response(null, { status: 404 });

  if (!llmConfigured()) return json({ ok: false, reason: "provider_unconfigured" }, 503);

  const startedAt = Date.now();
  const classify = async () => llmChatDetailed(SMOKE_CLASSIFIER_MESSAGES, {
    jsonMode: true,
    maxTokens: 60,
    temperature: 0,
    timeoutMs: 20_000,
  });
  let classifier = await classify();
  let classifierIntent = classifier.ok ? parseStudioSmokeIntent(classifier.result.text) : null;
  let classifierAttempts = 1;
  // The provider occasionally corrupts the small JSON completion
  // (`{"int##ent##": "##"}`); the Studio retries once too, so the probe reports
  // the capability that matters rather than a one-off token glitch.
  if (!classifier.ok || classifierIntent === null) {
    classifier = await classify();
    classifierIntent = classifier.ok ? parseStudioSmokeIntent(classifier.result.text) : null;
    classifierAttempts = 2;
  }

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

  return json({
    ok: result.ok,
    model: (process.env.LLM_MODEL ?? "").trim() || null,
    latencyMs: Date.now() - startedAt,
    checks: result.checks,
    classifier: classifier.ok ? { ok: true, text: classifier.result.text.slice(0, 240), attempts: classifierAttempts } : { ok: false, code: classifier.code, attempts: classifierAttempts },
    stream: stream.ok
      ? { ok: true, streamed: stream.streamed === true, characters: stream.result.text.trim().length }
      : { ok: false, code: stream.code, streamed: stream.streamed === true },
  }, result.ok ? 200 : 502);
}
