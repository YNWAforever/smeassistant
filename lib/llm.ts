import { logPauseRefusal, pauseState } from "./budgets/pause";

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
const OPENCODE_MODEL = "deepseek-v4-flash";
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
  | "no_model_output" | "invalid_provider_response";
export type LLMOutcome =
  | { ok: true; result: LLMResult }
  | { ok: false; code: LLMFailureCode; retryable: boolean; status?: number; retryAfterSeconds?: number; usage?: LLMUsage };

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20000);
  let abort: () => void = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new DOMException("Request deadline exceeded", "AbortError"));
    controller.signal.addEventListener("abort", abort, { once: true });
  });

  try {
    const resp = await Promise.race([fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": REFERER,
        "User-Agent": USER_AGENT,
        ...(usingOpenCodeBase ? { "x-opencode-session": opts.sessionId ?? crypto.randomUUID() } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: opts.maxTokens ?? 1000,
        temperature: opts.temperature ?? 0.5,
        ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    }), interrupted]);

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
