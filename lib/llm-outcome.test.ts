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
  it("aborts transport and bounds settlement even when usage persistence stalls", async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signal = init.signal;
      return new Promise<Response>(() => {});
    }));
    const deferred: Promise<unknown>[] = [];
    const { llmCompleteDetailed } = await import("./llm");
    const call = llmCompleteDetailed("fixture", { timeoutMs: 10, usageSettlementTimeoutMs: 25,
      onUsageObservation: async () => new Promise<void>(() => {}),
      deferUsageSettlement: work => { deferred.push(work); } });
    await vi.advanceTimersByTimeAsync(25);
    expect(await call).toMatchObject({ ok: false, usagePending: true });
    expect(signal.aborted).toBe(true);
    let settled = false;
    void Promise.all(deferred).then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(1000);
    expect(settled).toBe(true);
  });
  it("records late measured usage after the output deadline without returning late text or allowing automatic retry", async () => {
    vi.useFakeTimers();
    let release!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { release = resolve; })));
    const observations: unknown[] = [], deferred: Promise<unknown>[] = [];
    const options = { timeoutMs: 10, usageSettlementTimeoutMs: 30,
      onUsageObservation: async (value: unknown) => { observations.push(value); },
      deferUsageSettlement: (work: Promise<unknown>) => { deferred.push(work); } };
    const { llmCompleteDetailed } = await import("./llm");
    const call = llmCompleteDetailed("fixture", options);
    await vi.advanceTimersByTimeAsync(10);
    expect(await call).toMatchObject({ ok: false, code: "timeout", retryable: false, usagePending: true });
    release(new Response(JSON.stringify({ id: "provider-late-1", choices: [{ message: { content: "LATE_TEXT_MUST_NOT_BECOME_A_DRAFT" } }], usage: { prompt_tokens: 17, completion_tokens: 9 } })));
    await Promise.all(deferred);
    expect(observations).toEqual([expect.objectContaining({ state: "reported", late: true, providerRequestId: "provider-late-1", usage: { inputTokens: 17, outputTokens: 9 } })]);
    expect(JSON.stringify(observations)).not.toContain("LATE_TEXT_MUST_NOT_BECOME_A_DRAFT");
  });
  it("durably reports unknown when the bounded settlement window expires instead of inventing zero usage", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const observations: unknown[] = [], deferred: Promise<unknown>[] = [];
    const options = { timeoutMs: 10, usageSettlementTimeoutMs: 25,
      onUsageObservation: async (value: unknown) => { observations.push(value); },
      deferUsageSettlement: (work: Promise<unknown>) => { deferred.push(work); } };
    const { llmCompleteDetailed } = await import("./llm");
    const call = llmCompleteDetailed("fixture", options);
    await vi.advanceTimersByTimeAsync(10);
    expect(await call).toMatchObject({ ok: false, code: "timeout" });
    await vi.advanceTimersByTimeAsync(15);
    await Promise.all(deferred);
    expect(observations).toEqual([expect.objectContaining({ state: "unknown", reason: "settlement_timeout", usage: { inputTokens: null, outputTokens: null } })]);
  });
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
