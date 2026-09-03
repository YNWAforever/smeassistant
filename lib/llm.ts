// Centralized LLM gateway client.
//
// Defaults to OpenCode Go (https://opencode.ai/zen/go/v1), an OpenAI-compatible
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

const OPENCODE_BASE_URL = "https://opencode.ai/zen/go/v1";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENCODE_MODEL = "deepseek-v4-flash";
const OPENROUTER_MODEL = "openai/gpt-4o-mini";

const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY ?? "";
const LLM_API_KEY = process.env.LLM_API_KEY ?? "";
const OPENROUTER_KEY = process.env.OPENROUTER_KEY ?? "";
const BASE_URL = (process.env.LLM_BASE_URL ?? "").replace(/\/$/, "");
const MODEL = process.env.LLM_MODEL ?? "";
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

  return { apiKey, baseUrl, model, configured };
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
export async function llmComplete(prompt: string, opts: LLMOptions = {}): Promise<LLMResult | null> {
  const { apiKey, baseUrl, model, configured } = resolveLLMConfig();

  if (!configured || !apiKey) {
    console.error("[llm] set OPENCODE_API_KEY, LLM_API_KEY, or OPENROUTER_KEY");
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20000);

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": REFERER,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: opts.maxTokens ?? 1000,
        temperature: opts.temperature ?? 0.5,
        ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`[llm] API error ${resp.status}: ${body.slice(0, 300)}`);
      return null;
    }

    const data = await resp.json();
    const text: string = data?.choices?.[0]?.message?.content?.trim() ?? "";
    return text ? { text, usage: readUsage(data) } : null;
  } catch (err) {
    console.error("[llm] request failed:", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
