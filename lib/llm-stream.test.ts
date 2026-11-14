import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionBudget } from "./jobs/execution-budget";

const messages = [{ role: "user" as const, content: "fixture" }];
const content = { choices: [{ message: { content: "answer" } }], usage: { prompt_tokens: 17, completion_tokens: 9 } };
function held<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function budget(workMs: number, finalMs = workMs + 5000) {
  const started = Date.now();
  const controller = new AbortController();
  const executionBudget: ExecutionBudget = {
    signal: controller.signal,
    remainingMs: () => Math.max(0, started + workMs - Date.now()),
    cleanupRemainingMs: () => Math.max(0, started + finalMs - Date.now()),
  };
  return { executionBudget, controller };
}
function frame(text: string) {
  return new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }], usage: { prompt_tokens: 17, completion_tokens: 9 } })}\n\n`);
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.stubEnv("AI_DRAFTS_PAUSED", "");
  vi.stubEnv("OPENCODE_API_KEY", "fixture-key");
  vi.stubEnv("LLM_API_KEY", "");
  vi.stubEnv("OPENROUTER_KEY", "");
  vi.stubEnv("LLM_BASE_URL", "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("opt-in shared provider deadline", () => {
  it.each(["complete", "chat", "stream", "tracked"] as const)("refuses an expired %s call without dispatch", async kind => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const llm = await import("./llm");
    const opts = { ...budget(0), timeoutMs: 40_000 };
    const outcome = kind === "complete" ? await llm.llmCompleteDetailed("fixture", opts)
      : kind === "chat" ? await llm.llmChatDetailed(messages, opts)
        : kind === "tracked" ? await llm.llmCompleteDetailed("fixture", { ...opts, onUsageObservation: async () => {} })
          : await llm.llmChatStreamDetailed(messages, opts, () => {});
    expect(outcome).toMatchObject({ ok: false, code: "timeout" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("honors an already-aborted signal even with positive time remaining", async () => {
    const state = budget(50_000);
    state.controller.abort();
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const { llmChatDetailed } = await import("./llm");
    expect(await llmChatDetailed(messages, state)).toMatchObject({ code: "timeout" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("settles ignored fetch aborts and cancels a response arriving after expiry", async () => {
    const pending = held<Response>();
    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { llmChatDetailed } = await import("./llm");
    const call = llmChatDetailed(messages, { ...budget(100), timeoutMs: 40_000 });
    await vi.advanceTimersByTimeAsync(100);
    expect(await call).toMatchObject({ code: "timeout" });
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    const cancel = vi.fn(async () => {});
    const json = vi.fn(async () => content);
    pending.resolve({ ok: true, body: { cancel }, json } as unknown as Response);
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledOnce();
    expect(json).not.toHaveBeenCalled();
  });

  it.each(["complete", "chat"] as const)("bounds a stalled %s JSON body on work abort", async kind => {
    const state = budget(50_000);
    const body = held<unknown>();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: () => body.promise })));
    const llm = await import("./llm");
    const call = kind === "complete" ? llm.llmCompleteDetailed("fixture", state) : llm.llmChatDetailed(messages, state);
    await vi.advanceTimersByTimeAsync(0);
    state.controller.abort();
    expect(await call).toMatchObject({ code: "timeout" });
    body.resolve(content);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives a late pre-token fallback only the original remaining second", async () => {
    const state = budget(50_000);
    await vi.advanceTimersByTimeAsync(15_000); // classification already consumed this time
    const stream = held<Response>();
    const fallback = held<Response>();
    const fetchMock = vi.fn<typeof fetch>().mockReturnValueOnce(stream.promise).mockReturnValueOnce(fallback.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { llmChatStreamDetailed } = await import("./llm");
    const call = llmChatStreamDetailed(messages, { ...state, timeoutMs: 40_000 }, () => {});
    await vi.advanceTimersByTimeAsync(34_000);
    stream.reject(new TypeError("fixture reset"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await call).toMatchObject({ ok: false, code: "timeout", streamed: false });
    expect(fetchMock.mock.calls[1][1]?.signal?.aborted).toBe(true);
  });

  it("keeps the standalone fallback allowance unchanged", async () => {
    const stream = held<Response>();
    const fallback = held<Response>();
    const fetchMock = vi.fn<typeof fetch>().mockReturnValueOnce(stream.promise).mockReturnValueOnce(fallback.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { llmChatStreamDetailed } = await import("./llm");
    const call = llmChatStreamDetailed(messages, { timeoutMs: 40_000 }, () => {});
    await vi.advanceTimersByTimeAsync(34_000);
    stream.reject(new TypeError("fixture reset"));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(39_999);
    expect(fetchMock.mock.calls[1][1]?.signal?.aborted).toBe(false);
    fallback.resolve(new Response(JSON.stringify(content)));
    expect(await call).toMatchObject({ ok: true, streamed: false });
  });

  it("preserves timeout partials and usage, cancels ignored reads, and fences late deltas", async () => {
    const lateRead = held<ReadableStreamReadResult<Uint8Array>>();
    const reader = {
      read: vi.fn().mockResolvedValueOnce({ done: false, value: frame("partial") }).mockReturnValue(lateRead.promise),
      cancel: vi.fn(async () => {}),
    };
    const fetchMock = vi.fn(async () => ({ ok: true, body: { getReader: () => reader } }));
    vi.stubGlobal("fetch", fetchMock);
    const delta = vi.fn();
    const { llmChatStreamDetailed } = await import("./llm");
    const call = llmChatStreamDetailed(messages, budget(100), delta);
    await vi.advanceTimersByTimeAsync(100);
    expect(await call).toMatchObject({ ok: false, code: "timeout", text: "partial", usage: { inputTokens: 17, outputTokens: 9 }, usagePending: true });
    expect(reader.cancel).toHaveBeenCalledOnce();
    lateRead.resolve({ done: false, value: frame("late") });
    await vi.advanceTimersByTimeAsync(0);
    expect(delta.mock.calls).toEqual([["partial"]]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("never falls back when an ignored pre-token stream fetch reaches its deadline", async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const { llmChatStreamDetailed } = await import("./llm");
    const call = llmChatStreamDetailed(messages, budget(100), () => {});
    await vi.advanceTimersByTimeAsync(100);
    expect(await call).toMatchObject({ code: "timeout", streamed: true });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("checks absolute time before emitting a read that resolves ahead of its timer", async () => {
    const pending = held<ReadableStreamReadResult<Uint8Array>>();
    const reader = { read: vi.fn(() => pending.promise), cancel: vi.fn(async () => {}) };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, body: { getReader: () => reader } })));
    const delta = vi.fn();
    const { llmChatStreamDetailed } = await import("./llm");
    const call = llmChatStreamDetailed(messages, budget(100), delta);
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(100);
    pending.resolve({ done: false, value: frame("too late") });
    expect(await call).toMatchObject({ code: "timeout" });
    expect(delta).not.toHaveBeenCalled();
    expect(reader.cancel).toHaveBeenCalledOnce();
  });

  it("cleans up its own timers without aborting the caller budget on success", async () => {
    const state = budget(5000);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(content))));
    const { llmChatDetailed } = await import("./llm");
    expect(await llmChatDetailed(messages, state)).toMatchObject({ ok: true });
    expect(state.controller.signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds non-OK diagnostics and suppresses logging after the deadline", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const diagnostic = held<string>();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => ({ ok: false, status: 503, text: () => diagnostic.promise }));
    vi.stubGlobal("fetch", fetchMock);
    const { llmChatStreamDetailed } = await import("./llm");
    const call = llmChatStreamDetailed(messages, budget(100), () => {});
    await vi.advanceTimersByTimeAsync(100);
    expect(await call).toMatchObject({ code: "timeout" });
    diagnostic.resolve(JSON.stringify({ error: { code: "safe_code" } }));
    await vi.advanceTimersByTimeAsync(0);
    expect(errorLog).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("tracked accounting inside the shared finalization deadline", () => {
  it("includes a stalled unknown-observation callback inside the final cutoff", async () => {
    const pending = held<Response>();
    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    const observation = vi.fn(() => new Promise<void>(() => {}));
    const deferred: Promise<unknown>[] = [];
    const { llmCompleteDetailed } = await import("./llm");
    const call = llmCompleteDetailed("fixture", { ...budget(5000, 5500), timeoutMs: 4000, usageSettlementTimeoutMs: 10_000,
      onUsageObservation: observation, deferUsageSettlement: work => { deferred.push(work); } });
    await vi.advanceTimersByTimeAsync(4000);
    expect(await call).toMatchObject({ code: "timeout", usagePending: true, retryable: false });
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(observation).toHaveBeenCalledWith(expect.objectContaining({ state: "unknown", usage: { inputTokens: null, outputTokens: null } }));
    let settled = false;
    void Promise.all(deferred).then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    pending.resolve(new Response(JSON.stringify(content)));
    await vi.advanceTimersByTimeAsync(0);
    expect(observation).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts on the work signal while retaining a bounded accounting task", async () => {
    const state = budget(5000, 10_000);
    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const deferred: Promise<unknown>[] = [];
    const observation = vi.fn(() => new Promise<void>(() => {}));
    const { llmCompleteDetailed } = await import("./llm");
    const call = llmCompleteDetailed("fixture", { ...state, onUsageObservation: observation, deferUsageSettlement: work => { deferred.push(work); } });
    await vi.advanceTimersByTimeAsync(1000);
    state.controller.abort();
    expect(await call).toMatchObject({ code: "timeout", usagePending: true });
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all(deferred);
    expect(observation).toHaveBeenCalledOnce();
  });

  it("retains late measured usage within work time without exposing late output", async () => {
    const pending = held<Response>();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockReturnValue(pending.promise));
    const observation = vi.fn(async () => {});
    const deferred: Promise<unknown>[] = [];
    const { llmChatDetailed } = await import("./llm");
    const call = llmChatDetailed(messages, { ...budget(10_000, 15_000), timeoutMs: 1000, usageSettlementTimeoutMs: 5000,
      onUsageObservation: observation, deferUsageSettlement: work => { deferred.push(work); } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await call).toMatchObject({ code: "timeout", usagePending: true });
    pending.resolve(new Response(JSON.stringify(content)));
    await Promise.all(deferred);
    expect(observation).toHaveBeenCalledWith(expect.objectContaining({ state: "reported", late: true, usage: { inputTokens: 17, outputTokens: 9 } }));
    expect(JSON.stringify(observation.mock.calls)).not.toContain("answer");
  });

  it("does not expose success when a callback crosses the absolute deadline before timers run", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(content))));
    const observation = vi.fn(async () => { vi.setSystemTime(3000); });
    const { llmCompleteDetailed } = await import("./llm");
    const outcome = await llmCompleteDetailed("fixture", { ...budget(2000, 3000), onUsageObservation: observation });
    expect(outcome).toMatchObject({ ok: false, code: "timeout", usagePending: true });
    expect(observation).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start a conflicting unknown write while a reported observation stalls", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(content))));
    const observation = vi.fn(() => new Promise<void>(() => {}));
    const deferred: Promise<unknown>[] = [];
    const { llmCompleteDetailed } = await import("./llm");
    const call = llmCompleteDetailed("fixture", { ...budget(2000, 3000), onUsageObservation: observation,
      deferUsageSettlement: work => { deferred.push(work); } });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await call).toMatchObject({ code: "timeout", usagePending: true });
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all(deferred);
    expect(observation).toHaveBeenCalledOnce();
    expect(observation).toHaveBeenCalledWith(expect.objectContaining({ state: "reported" }));
  });
});
