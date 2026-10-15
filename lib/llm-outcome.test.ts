import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("AI_DRAFTS_PAUSED", "");
  vi.stubEnv("OPENCODE_API_KEY", "fixture-key");
  vi.stubEnv("LLM_API_KEY", "");
  vi.stubEnv("OPENROUTER_KEY", "");
  vi.stubEnv("LLM_BASE_URL", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("T19 provider outcomes", () => {
  it.each([
    { model: "longcat-2.5-preview-free", baseUrl: "https://opencode.ai/inference/go/v1", jsonMode: true, thinking: { type: "disabled" } },
    { model: "longcat-2.5-preview-free", baseUrl: "https://custom.example/v1", jsonMode: true, thinking: undefined },
    { model: "deepseek-v4.1-flash", baseUrl: "https://opencode.ai/inference/go/v1", jsonMode: true, thinking: undefined },
    { model: "longcat-2.5-preview-free", baseUrl: "https://opencode.ai/inference/go/v1", jsonMode: false, thinking: undefined },
  ])("sets draft reasoning options only for OpenCode LongCat JSON ($model, $baseUrl, json=$jsonMode)", async ({ model, baseUrl, jsonMode, thinking }) => {
    vi.stubEnv("LLM_MODEL", model);
    vi.stubEnv("LLM_BASE_URL", baseUrl);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"draft":"fixture"}' } }] })));
    vi.stubGlobal("fetch", fetchMock);
    const { llmCompleteDetailed } = await import("./llm");
    expect(await llmCompleteDetailed("fixture draft", { jsonMode, timeoutMs: 1000 })).toMatchObject({ ok: true, result: { text: '{"draft":"fixture"}' } });
    const request = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(request[1].body));
    expect(body.thinking).toEqual(thinking);
    expect(body.model).toBe(model);
    expect(body.response_format).toEqual(jsonMode ? { type: "json_object" } : undefined);
  });

  it("refuses missing configuration before any fetch", async () => {
    vi.stubEnv("OPENCODE_API_KEY", "");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const { llmCompleteDetailed } = await import("./llm");
    expect(await llmCompleteDetailed("fixture")).toEqual({ ok: false, code: "provider_unconfigured", retryable: false });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500, 503])("classifies HTTP %s without reading provider error text", async status => {
    const body = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status, headers: new Headers({ "Retry-After": "12" }), json: body })));
    const { llmCompleteDetailed } = await import("./llm");
    expect(await llmCompleteDetailed("fixture")).toMatchObject({ ok: false, status,
      code: status === 401 || status === 403 ? "provider_auth_failed" : status === 429 ? "provider_rate_limited" : "provider_unavailable",
      retryable: status >= 429,
      ...(status === 429 ? { retryAfterSeconds: 12 } : {}),
    });
    expect(body).not.toHaveBeenCalled();
  });
  it.each(["junk", ""])("distinguishes malformed provider JSON from empty output (%s)", async content => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(content === "junk" ? "{broken" : JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })));
    const { llmCompleteDetailed } = await import("./llm");
    expect(await llmCompleteDetailed("fixture")).toMatchObject({ ok: false, code: content === "junk" ? "invalid_provider_response" : "no_model_output", retryable: false });
  });
  it("rejects malformed content types without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 123 } }] }))));
    const { llmCompleteDetailed } = await import("./llm");
    expect(await llmCompleteDetailed("fixture")).toMatchObject({ ok: false, code: "invalid_provider_response" });
  });
  it("keeps unknown usage null and leaves schema validation to the agent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "not agent JSON" } }] }))));
    const { llmCompleteDetailed } = await import("./llm");
    expect(await llmCompleteDetailed("fixture")).toEqual({ ok: true, result: { text: "not agent JSON", usage: { inputTokens: null, outputTokens: null } } });
  });
  it("bounds response body reading even after provider headers returned 200", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: () => new Promise(() => {}) })));
    const { llmCompleteDetailed } = await import("./llm");
    const call = llmCompleteDetailed("fixture", { timeoutMs: 25 });
    await vi.advanceTimersByTimeAsync(25);
    expect(await call).toEqual({ ok: false, code: "timeout", retryable: true });
  });
  it("distinguishes network failure from model output", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fixture network failure"); }));
    const { llmCompleteDetailed } = await import("./llm");
    expect(await llmCompleteDetailed("fixture")).toEqual({ ok: false, code: "network_error", retryable: true });
  });
});
