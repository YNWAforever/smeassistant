import { logPauseRefusal, pauseState } from "./budgets/pause";
import type { ProviderUsageObservation } from "./workspace/provider-usage";

// Centralized LLM gateway client.
//
// Defaults to OpenCode Go (https://opencode.ai/inference/go/v1), an OpenAI-compatible
// gateway. Every value is overridable via env so the provider can be swapped
// without code changes:
//   OPENCODE_API_KEY  – API key (Bearer).               (preferred)
//   LLM_API_KEY       – legacy alias for OPENCODE_API_KEY
//   OPENROUTER_KEY    – backwards-compatible fallback key
//   LLM_BASE_URL      – gateway base url.                (optional override)
//   LLM_MODEL         – model id.                        (default depends on key)
//
// Returns the assistant message text, or null on any failure (missing key,
// non-2xx, network/timeout, empty body). Callers fall back gracefully on null.

// OpenCode moved Go from /zen/go/v1 to /inference/go/v1. Both now answer 400
// MissingSessionID unless the request carries `x-opencode-session` (one stable id
// per conversation) and the client names itself in User-Agent
// (https://opencode.ai/docs/go/#where-can-i-use-it).
const OPENCODE_BASE_URL = "https://opencode.ai/inference/go/v1";
const USER_AGENT = "sme-scanner/1.0";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENCODE_MODEL = "deepseek-v4.1-flash";
const OPENROUTER_MODEL = "openai/gpt-4o-mini";

// Trimmed: a value pasted into the Vercel dashboard can carry a trailing space or
// newline, and `Bearer <key>\n` is rejected by the gateway as an invalid credential.
const OPENCODE_API_KEY = (process.env.OPENCODE_API_KEY ?? "").trim();
const LLM_API_KEY = (process.env.LLM_API_KEY ?? "").trim();
const OPENROUTER_KEY = (process.env.OPENROUTER_KEY ?? "").trim();
const BASE_URL = (process.env.LLM_BASE_URL ?? "").trim().replace(/\/$/, "");
const MODEL = (process.env.LLM_MODEL ?? "").trim();
const REFERER = process.env.NEXT_PUBLIC_APP_URL ?? "https://smescanner.fimmick.com";

function resolveLLMConfig() {
  const hasOpenCodeKey = OPENCODE_API_KEY.length > 0 || LLM_API_KEY.length > 0;
  const hasOpenRouterKey = OPENROUTER_KEY.length > 0;
  const baseUrl = BASE_URL || (hasOpenCodeKey ? OPENCODE_BASE_URL : hasOpenRouterKey ? OPENROUTER_BASE_URL : OPENCODE_BASE_URL);
  const usingOpenRouterBase = baseUrl.includes("openrouter.ai");
  const usingOpenCodeBase = baseUrl.includes("opencode.ai");

  let apiKey = "";
  if (usingOpenRouterBase) {
    apiKey = OPENROUTER_KEY;
  } else if (usingOpenCodeBase) {
    apiKey = OPENCODE_API_KEY || LLM_API_KEY;
  } else {
    apiKey = OPENCODE_API_KEY || LLM_API_KEY || OPENROUTER_KEY;
  }

  const defaultModel = usingOpenRouterBase || (!BASE_URL && hasOpenRouterKey && !hasOpenCodeKey) ? OPENROUTER_MODEL : OPENCODE_MODEL;
  const model = MODEL || defaultModel;
  const configured = Boolean(apiKey && baseUrl);

  return { apiKey, baseUrl, model, configured, usingOpenCodeBase };
}

export function llmConfigured(): boolean {
  return resolveLLMConfig().configured;
}

export interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
  /** Request strict JSON output. Off by default — not every gateway model supports it. */
  jsonMode?: boolean;
  timeoutMs?: number;
  /**
   * Failures are logged without any provider text on every call: only the HTTP
   * status, or the thrown error's class name. A provider error body can echo
   * the input (OpenRouter moderation returns `metadata.flagged_input`), and a
   * network error's message or cause can carry host details; every agent prompt
   * carries owner facts or review excerpts. The P4.5 preview still passes
   * `true` so its redaction does not depend on this default.
   */
  redactErrors?: boolean;
  /**
   * OpenCode's `x-opencode-session`: one stable id per conversation, so retries
   * of one agent run share it. A fresh id is used when the caller has none.
   */
  sessionId?: string;
  /** Usage-only observation may continue after the unchanged output deadline. */
  usageSettlementTimeoutMs?: number;
  onUsageObservation?: (observation: ProviderUsageObservation) => Promise<void>;
  deferUsageSettlement?: (work: Promise<unknown>) => void;
}

export interface LLMUsage {
  /** Null when the gateway omitted usage — not every OpenAI-compatible one reports it. */
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface LLMResult {
  text: string;
  usage: LLMUsage;
}

export type LLMFailureCode = "ai_paused" | "provider_unconfigured" | "provider_auth_failed"
  | "provider_rate_limited" | "provider_unavailable" | "timeout" | "network_error"
  | "no_model_output" | "invalid_provider_response" | "usage_record_failed" | "provider_usage_pending";
export type LLMOutcome =
  | { ok: true; result: LLMResult }
  | { ok: false; code: LLMFailureCode; retryable: boolean; status?: number; retryAfterSeconds?: number; usage?: LLMUsage; usagePending?: boolean };

function readUsage(data: unknown): LLMUsage {
  const usage = (data as { usage?: Record<string, unknown> } | null)?.usage;
  const asCount = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  return {
    inputTokens: asCount(usage?.prompt_tokens),
    outputTokens: asCount(usage?.completion_tokens),
  };
}

/**
 * Tracked drafting keeps the output deadline distinct from a bounded,
 * post-response usage settlement. No late text is exposed to the caller.
 * A killed host can leave the prior durable reservation pending; it is never
 * reinterpreted as zero or permission to make another request.
 */
async function trackedCompletion(request: (signal: AbortSignal) => Promise<Response>, opts: LLMOptions): Promise<LLMOutcome> {
  const controller = new AbortController();
  const outputMs = opts.timeoutMs ?? 20_000;
  const settlementMs = Math.max(outputMs, Math.min(opts.usageSettlementTimeoutMs ?? outputMs, 55_000));
  const timedOut: LLMOutcome = { ok: false, code: "timeout", retryable: false, usagePending: true };
  let late = false, closed = false;
  let providerRequestId: string | undefined;
  let closeSettlement!: (outcome: LLMOutcome) => void;
  const hardEnd = new Promise<LLMOutcome>(resolve => { closeSettlement = resolve; });
  const observe = (value: ProviderUsageObservation) => opts.onUsageObservation!(value);
  const hardTimer = setTimeout(async () => {
    closed = true;
    controller.abort();
    let outcome = timedOut;
    let observationTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        observe({ state: "unknown", usage: { inputTokens: null, outputTokens: null },
          reason: "settlement_timeout", late: true, ...(providerRequestId ? { providerRequestId } : {}) }),
        new Promise<never>((_, reject) => { observationTimer = setTimeout(() => reject(new Error("usage_record_timeout")), 1000); }),
      ]);
    } catch { outcome = { ok: false, code: "usage_record_failed", retryable: false, usagePending: true }; }
    finally { clearTimeout(observationTimer); }
    closeSettlement(outcome);
  }, settlementMs);
  const work = (async (): Promise<LLMOutcome> => {
    try {
      const response = await request(controller.signal);
      if (closed) return hardEnd;
      const headerId = response.headers?.get("x-request-id");
      if (headerId && /^[\w.:-]{1,200}$/.test(headerId)) providerRequestId = headerId;
      if (!response.ok) {
        const code = response.status === 401 || response.status === 403 ? "provider_auth_failed"
          : response.status === 429 ? "provider_rate_limited" : "provider_unavailable";
        // Never read an error body: it can echo merchant prompts.
        await observe({ state: response.status >= 500 ? "unknown" : "rejected", usage: { inputTokens: null, outputTokens: null },
          reason: code, late, ...(providerRequestId ? { providerRequestId } : {}) });
        const retry = response.headers?.get("retry-after");
        return { ok: false, code, status: response.status, retryable: response.status === 429,
          ...(response.status >= 500 ? { usagePending: true } : {}),
          ...(response.status === 429 && retry && /^\d+$/.test(retry) && Number(retry) <= 3600 ? { retryAfterSeconds: Number(retry) } : {}) };
      }
      let data: unknown;
      try { data = await response.json(); }
      catch {
        if (closed) return hardEnd;
        await observe({ state: "unknown", usage: { inputTokens: null, outputTokens: null }, reason: "invalid_provider_response", late });
        return { ok: false, code: "invalid_provider_response", retryable: false, usagePending: true };
      }
      if (closed) return hardEnd;
      const id = (data as { id?: unknown } | null)?.id;
      if (typeof id === "string" && /^[\w.:-]{1,200}$/.test(id)) providerRequestId = id;
      const usage = readUsage(data);
      await observe({ state: "reported", usage, late, ...(providerRequestId ? { providerRequestId } : {}) });
      const content = (data as { choices?: Array<{ message?: { content?: unknown } }> } | null)?.choices?.[0]?.message?.content;
      if (typeof content !== "string") return { ok: false, code: "invalid_provider_response", retryable: false, usage };
      return content.trim() ? { ok: true, result: { text: content.trim(), usage } }
        : { ok: false, code: "no_model_output", retryable: false, usage };
    } catch (error) {
      if (closed) return hardEnd;
      try {
        await observe({ state: "unknown", usage: { inputTokens: null, outputTokens: null }, reason: "network_error", late,
          ...(providerRequestId ? { providerRequestId } : {}) });
      } catch {
        console.error("[llm] usage settlement failed", { category: "usage_record_failed" });
        return { ok: false, code: "usage_record_failed", retryable: false, usagePending: true };
      }
      void error;
      return { ok: false, code: "network_error", retryable: false, usagePending: true };
    }
  })();
  const settlement = Promise.race([work, hardEnd]).finally(() => { closed = true; clearTimeout(hardTimer); });
  opts.deferUsageSettlement?.(settlement.then(() => undefined));
  let outputTimer: ReturnType<typeof setTimeout>;
  const outputEnd = new Promise<LLMOutcome>(resolve => { outputTimer = setTimeout(() => { late = true; resolve(timedOut); }, outputMs); });
  try { return await Promise.race([settlement, outputEnd]); } finally { clearTimeout(outputTimer!); }
}

/**
 * Returns the completion AND its token usage.
 *
 * The usage half exists because the response body always carried it and this
 * function threw it away, reading only choices[0].message.content. Nothing could
 * therefore measure what an LLM call cost — and docs/v0.2-plan.md section 7.1
 * flags that as a sequencing hazard: add agent_runs.cost before usage is
 * available and the column ships permanently null, exactly as leads.lead_score
 * did.
 *
 * Still returns null on every failure — timeout, missing key, non-2xx, malformed
 * response — so callers keep their single "no completion" branch.
 */
export async function llmCompleteDetailed(prompt: string, opts: LLMOptions = {}): Promise<LLMOutcome> {
  // P3.5d backstop: every caller already handles null, so an AI pause stops
  // report summaries and translations too, before any network call.
  if (pauseState().ai) {
    logPauseRefusal("llm");
    return { ok: false, code: "ai_paused", retryable: false };
  }
  const { apiKey, baseUrl, model, configured, usingOpenCodeBase } = resolveLLMConfig();

  if (!configured || !apiKey) {
    console.error("[llm] unavailable", { category: "provider_unconfigured" });
    return { ok: false, code: "provider_unconfigured", retryable: false };
  }

  const request = (signal: AbortSignal) => fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": REFERER,
      "User-Agent": USER_AGENT,
      ...(usingOpenCodeBase ? { "x-opencode-session": opts.sessionId ?? crypto.randomUUID() } : {}),
    },
    body: JSON.stringify({
      model, messages: [{ role: "user", content: prompt }], max_tokens: opts.maxTokens ?? 1000,
      temperature: opts.temperature ?? 0.5,
      ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      ...(usingOpenCodeBase && model === "longcat-2.5-preview-free" && opts.jsonMode ? { thinking: { type: "disabled" } } : {}),
    }),
    signal,
  });
  if (opts.onUsageObservation) return trackedCompletion(request, opts);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20000);
  let abort: () => void = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new DOMException("Request deadline exceeded", "AbortError"));
    controller.signal.addEventListener("abort", abort, { once: true });
  });

  try {
    const resp = await Promise.race([request(controller.signal), interrupted]);

    if (!resp.ok) {
      // The body is never read: it can echo the prompt.
      console.error("[llm] API error", { status: resp.status });
      const status = resp.status;
      const rawRetry = resp.headers?.get("retry-after");
      const retrySeconds = rawRetry && /^\d+$/.test(rawRetry) ? Number(rawRetry) : rawRetry ? Math.ceil((Date.parse(rawRetry) - Date.now()) / 1000) : NaN;
      return { ok: false, status,
        code: status === 401 || status === 403 ? "provider_auth_failed" : status === 429 ? "provider_rate_limited" : "provider_unavailable",
        retryable: status === 429 || status >= 500,
        ...(status === 429 && Number.isFinite(retrySeconds) && retrySeconds >= 0 && retrySeconds <= 3600 ? { retryAfterSeconds: retrySeconds } : {}),
      };
    }

    let data: unknown;
    try { data = await Promise.race([resp.json(), interrupted]); }
    catch (error) {
      if (controller.signal.aborted) throw error;
      return { ok: false, code: "invalid_provider_response", retryable: false };
    }
    const choices = data && typeof data === "object" ? (data as { choices?: unknown }).choices : undefined;
    const first: unknown = Array.isArray(choices) ? choices[0] : undefined;
    const message = first && typeof first === "object" ? (first as { message?: unknown }).message : undefined;
    const content = message && typeof message === "object" ? (message as { content?: unknown }).content : undefined;
    const usage = readUsage(data);
    if (typeof content !== "string") return { ok: false, code: "invalid_provider_response", retryable: false, usage };
    const text = content.trim();
    if (!text) {
      // Metadata only, never content: an empty answer after `length` means the
      // allowance went to reasoning, which nothing else in the logs would show.
      const finishReason = first && typeof first === "object" ? (first as { finish_reason?: unknown }).finish_reason : undefined;
      const details = (data as { usage?: { completion_tokens_details?: { reasoning_tokens?: unknown } } } | null)?.usage?.completion_tokens_details;
      console.error("[llm] empty model output", {
        finishReason: typeof finishReason === "string" ? finishReason : null,
        reasoningTokens: typeof details?.reasoning_tokens === "number" ? details.reasoning_tokens : null,
        outputTokens: usage.outputTokens,
      });
    }
    return text ? { ok: true, result: { text, usage } } : { ok: false, code: "no_model_output", retryable: false, usage };
  } catch (err) {
    const name = typeof (err as { name?: unknown } | null)?.name === "string" ? (err as { name: string }).name : "unknown";
    console.error("[llm] request failed", { error: name });
    return { ok: false, code: controller.signal.aborted || name === "AbortError" ? "timeout" : "network_error", retryable: true };
  } finally {
    clearTimeout(timeout);
    controller.signal.removeEventListener("abort", abort);
  }
}

/** Compatibility adapter for summary/translation callers. */
export async function llmComplete(prompt: string, opts: LLMOptions = {}): Promise<LLMResult | null> {
  const outcome = await llmCompleteDetailed(prompt, opts);
  return outcome.ok ? outcome.result : null;
}

// ---------------------------------------------------------------------------
// Multi-message chat and streaming (Conversation Studio, design §6.3)
//
// Additive on purpose: `llmComplete`/`llmCompleteDetailed` are untouched so
// every existing caller keeps byte-compatible behaviour. The two helpers below
// speak the same OpenAI-compatible gateway, with the same configuration
// resolution, error mapping, usage reading and timeouts.
// ---------------------------------------------------------------------------

export const LLM_CHAT_ROLES = ["system", "user", "assistant"] as const;

/** One OpenAI-compatible chat message. Content is always plain text here. */
export interface LLMChatMessage {
  role: (typeof LLM_CHAT_ROLES)[number];
  content: string;
}

const MAX_TIMEOUT_MS = 55_000;

function chatHeaders(apiKey: string, usingOpenCodeBase: boolean, opts: LLMOptions): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": REFERER,
    "User-Agent": USER_AGENT,
    ...(usingOpenCodeBase ? { "x-opencode-session": opts.sessionId ?? crypto.randomUUID() } : {}),
  };
}

function chatBody(model: string, messages: LLMChatMessage[], opts: LLMOptions, usingOpenCodeBase: boolean, stream: boolean) {
  return {
    model,
    // Only the documented role/content pair is forwarded: nothing caller-shaped
    // (no tool calls, no names) can leak into a provider request.
    messages: messages.map((message) => ({ role: message.role, content: message.content })),
    max_tokens: opts.maxTokens ?? 1000,
    temperature: opts.temperature ?? 0.5,
    ...(stream ? { stream: true } : {}),
    ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
    ...(usingOpenCodeBase && model === "longcat-2.5-preview-free" && opts.jsonMode ? { thinking: { type: "disabled" } } : {}),
  };
}

/**
 * The multi-turn sibling of `llmCompleteDetailed`: same gateway, same error
 * mapping and usage shape, but it forwards an ordered message array instead of
 * wrapping one prompt in a user message.
 */
export async function llmChatDetailed(messages: LLMChatMessage[], opts: LLMOptions = {}): Promise<LLMOutcome> {
  if (pauseState().ai) {
    logPauseRefusal("llm");
    return { ok: false, code: "ai_paused", retryable: false };
  }
  const { apiKey, baseUrl, model, configured, usingOpenCodeBase } = resolveLLMConfig();
  if (!configured || !apiKey) {
    console.error("[llm] unavailable", { category: "provider_unconfigured" });
    return { ok: false, code: "provider_unconfigured", retryable: false };
  }

  const request = (signal: AbortSignal) => fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: chatHeaders(apiKey, usingOpenCodeBase, opts),
    body: JSON.stringify(chatBody(model, messages, opts, usingOpenCodeBase, false)),
    signal,
  });
  if (opts.onUsageObservation) return trackedCompletion(request, opts);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20000);
  let abort: () => void = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new DOMException("Request deadline exceeded", "AbortError"));
    controller.signal.addEventListener("abort", abort, { once: true });
  });

  try {
    const resp = await Promise.race([request(controller.signal), interrupted]);
    if (!resp.ok) {
      // The body is never read: it can echo the prompt.
      console.error("[llm] API error", { status: resp.status });
      const status = resp.status;
      const rawRetry = resp.headers?.get("retry-after");
      const retrySeconds = rawRetry && /^\d+$/.test(rawRetry) ? Number(rawRetry) : rawRetry ? Math.ceil((Date.parse(rawRetry) - Date.now()) / 1000) : NaN;
      return {
        ok: false,
        status,
        code: status === 401 || status === 403 ? "provider_auth_failed" : status === 429 ? "provider_rate_limited" : "provider_unavailable",
        retryable: status === 429 || status >= 500,
        ...(status === 429 && Number.isFinite(retrySeconds) && retrySeconds >= 0 && retrySeconds <= 3600 ? { retryAfterSeconds: retrySeconds } : {}),
      };
    }

    let data: unknown;
    try { data = await Promise.race([resp.json(), interrupted]); }
    catch (error) {
      if (controller.signal.aborted) throw error;
      return { ok: false, code: "invalid_provider_response", retryable: false };
    }
    const choices = data && typeof data === "object" ? (data as { choices?: unknown }).choices : undefined;
    const first: unknown = Array.isArray(choices) ? choices[0] : undefined;
    const message = first && typeof first === "object" ? (first as { message?: unknown }).message : undefined;
    const content = message && typeof message === "object" ? (message as { content?: unknown }).content : undefined;
    const usage = readUsage(data);
    if (typeof content !== "string") return { ok: false, code: "invalid_provider_response", retryable: false, usage };
    const text = content.trim();
    return text ? { ok: true, result: { text, usage } } : { ok: false, code: "no_model_output", retryable: false, usage };
  } catch (err) {
    const name = typeof (err as { name?: unknown } | null)?.name === "string" ? (err as { name: string }).name : "unknown";
    console.error("[llm] request failed", { error: name });
    return { ok: false, code: controller.signal.aborted || name === "AbortError" ? "timeout" : "network_error", retryable: true };
  } finally {
    clearTimeout(timeout);
    controller.signal.removeEventListener("abort", abort);
  }
}

/** A stream failure before or after the first token, distinguished by `text`. */
export type LLMStreamFailureCode = LLMFailureCode | "stream_interrupted";

export type LLMStreamOutcome =
  | { ok: true; result: LLMResult; streamed: boolean }
  | {
      ok: false;
      code: LLMStreamFailureCode;
      retryable: boolean;
      status?: number;
      retryAfterSeconds?: number;
      usage?: LLMUsage;
      usagePending?: boolean;
      /** What arrived before the stream broke; the orchestrator stores it visibly. */
      text?: string;
      streamed?: boolean;
    };

interface StreamFrame {
  done: boolean;
  text: string | null;
  usage: LLMUsage | null;
}

/**
 * One SSE `data:` line from an OpenAI-compatible stream. Anything that is not a
 * content frame, a usage frame or `[DONE]` is a comment/keep-alive and ignored —
 * a malformed frame must not break an otherwise healthy answer.
 */
function parseStreamFrame(line: string): StreamFrame | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const data = trimmed.slice(5).trim();
  if (!data) return null;
  if (data === "[DONE]") return { done: true, text: null, usage: null };
  let payload: unknown;
  try { payload = JSON.parse(data); } catch { return null; }
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown }).choices;
  const first: unknown = Array.isArray(choices) ? choices[0] : undefined;
  const delta = first && typeof first === "object" ? (first as { delta?: unknown }).delta : undefined;
  const message = first && typeof first === "object" ? (first as { message?: unknown }).message : undefined;
  const deltaContent = delta && typeof delta === "object" ? (delta as { content?: unknown }).content : undefined;
  const messageContent = message && typeof message === "object" ? (message as { content?: unknown }).content : undefined;
  const content = typeof deltaContent === "string" ? deltaContent : typeof messageContent === "string" ? messageContent : null;
  const usageRaw = (payload as { usage?: unknown }).usage;
  const usage = usageRaw && typeof usageRaw === "object" ? readUsage(payload) : null;
  if (content === null && usage === null) return null;
  return { done: false, text: content, usage };
}

/**
 * Streaming sibling of `llmChatDetailed` (design §6.3).
 *
 * Calls `onDelta` per content fragment and resolves the concatenated text and
 * usage. A stream that fails **before the first token** falls back once to the
 * non-streaming call; after the first token the partial text is returned with
 * `code: "stream_interrupted"` so the caller can store what did arrive and
 * label it honestly. `onDelta` is best-effort: a disconnected client must not
 * turn a provider answer into a failed request.
 */
export async function llmChatStreamDetailed(
  messages: LLMChatMessage[],
  opts: LLMOptions,
  onDelta: (text: string) => void,
): Promise<LLMStreamOutcome> {
  if (pauseState().ai) {
    logPauseRefusal("llm");
    return { ok: false, code: "ai_paused", retryable: false, streamed: true };
  }
  const { apiKey, baseUrl, model, configured, usingOpenCodeBase } = resolveLLMConfig();
  if (!configured || !apiKey) {
    console.error("[llm] unavailable", { category: "provider_unconfigured" });
    return { ok: false, code: "provider_unconfigured", retryable: false, streamed: true };
  }

  const controller = new AbortController();
  const timeoutMs = Math.min(opts.timeoutMs ?? 20_000, MAX_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const timeoutFailure = (): LLMStreamOutcome => ({ ok: false, code: "timeout", retryable: false, usagePending: true, streamed: true });

  // The one non-streaming retry, only while nothing has been shown to the owner.
  const fallback = async (): Promise<LLMStreamOutcome> => {
    clearTimeout(timeout);
    const outcome = await llmChatDetailed(messages, { ...opts, timeoutMs });
    return outcome.ok
      ? { ok: true, result: outcome.result, streamed: false }
      : { ...outcome, streamed: false };
  };

  try {
    let resp: Response;
    try {
      resp = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: chatHeaders(apiKey, usingOpenCodeBase, opts),
        body: JSON.stringify(chatBody(model, messages, opts, usingOpenCodeBase, true)),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) return timeoutFailure();
      void error;
      return await fallback();
    }
    if (!resp.ok) return await fallback();
    const body = resp.body;
    if (!body) return await fallback();

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let usage: LLMUsage = { inputTokens: null, outputTokens: null };
    let sawToken = false;
    let finished = false;

    const consume = (line: string) => {
      const frame = parseStreamFrame(line);
      if (!frame) return;
      if (frame.done) { finished = true; return; }
      if (frame.usage) usage = frame.usage;
      if (frame.text !== null && frame.text !== "") {
        sawToken = true;
        text += frame.text;
        try { onDelta(frame.text); } catch { /* the reader went away; keep the text */ }
      }
    };

    try {
      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let index = buffer.indexOf("\n");
        while (index >= 0) {
          consume(buffer.slice(0, index).replace(/\r$/, ""));
          buffer = buffer.slice(index + 1);
          if (finished) break;
          index = buffer.indexOf("\n");
        }
      }
      if (!finished && buffer.trim()) consume(buffer);
    } catch (error) {
      if (controller.signal.aborted) return timeoutFailure();
      void error;
      // A broken transport after a token is a partial answer, not a silent one.
      return sawToken
        ? { ok: false, code: "stream_interrupted", retryable: false, text, usage, streamed: true }
        : await fallback();
    }

    const trimmed = text.trim();
    if (!trimmed) return sawToken ? { ok: false, code: "no_model_output", retryable: false, usage, streamed: true } : await fallback();
    return { ok: true, result: { text: trimmed, usage }, streamed: true };
  } finally {
    clearTimeout(timeout);
  }
}
