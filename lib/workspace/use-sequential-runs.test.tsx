// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

const clientMocks = vi.hoisted(() => ({ runAction: vi.fn() }));
vi.mock("@/lib/workspace/client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  runAction: clientMocks.runAction,
}));

import type { ClientResult, RunActionResult } from "./client";
import { classifyRun, useSequentialRuns } from "./use-sequential-runs";

const READY: ClientResult<RunActionResult> = { ok: true, data: { runId: "r", state: "succeeded", versionId: "v", versionNo: 1 } };
const FACTS: ClientResult<RunActionResult> = { ok: true, data: { runId: "r", state: "succeeded", factsNeeded: ["capacity"] } };
const FAILED: ClientResult<RunActionResult> = { ok: true, data: { runId: "r", state: "failed" } };
const PAUSED: ClientResult<RunActionResult> = { ok: false, status: 503, error: "ai_paused" };
const BUDGET: ClientResult<RunActionResult> = { ok: false, status: 429, error: "ai_budget_reached" };

describe("classifyRun", () => {
  it("maps each outcome to a row state", () => {
    expect(classifyRun(READY)).toBe("draft_ready");
    expect(classifyRun(FACTS)).toBe("needs_input");
    expect(classifyRun(FAILED)).toBe("failed");
    expect(classifyRun(PAUSED)).toBe("failed");
    expect(classifyRun({ ok: false, status: 0, error: "network" })).toBe("failed");
  });
});

describe("useSequentialRuns", () => {
  beforeEach(() => clientMocks.runAction.mockReset());
  afterEach(cleanup);

  it("runs one at a time, in order, and records each outcome", async () => {
    let finishFirst!: (value: unknown) => void;
    clientMocks.runAction.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; })).mockResolvedValueOnce(FACTS).mockResolvedValueOnce(FAILED);
    const { result } = renderHook(() => useSequentialRuns());
    let done!: Promise<void>;
    await act(async () => { done = result.current.runAll(["a", "b", "c"]); });
    expect(clientMocks.runAction.mock.calls.map((call) => call[0])).toEqual(["a"]);
    expect(result.current.rows).toEqual({ a: "generating" });
    await act(async () => { finishFirst(READY); await done; });
    expect(clientMocks.runAction.mock.calls.map((call) => call[0])).toEqual(["a", "b", "c"]);
    expect(result.current.rows).toEqual({ a: "draft_ready", b: "needs_input", c: "failed" });
    expect(result.current.results.b).toBe(FACTS);
  });

  it.each([["ai_paused", PAUSED], ["ai_budget_reached", BUDGET]] as const)("stops on %s: no later run, later rows idle, onStop once", async (reason, refusal) => {
    clientMocks.runAction.mockResolvedValueOnce(READY).mockResolvedValueOnce(refusal).mockResolvedValue(READY);
    const onStop = vi.fn();
    const { result } = renderHook(() => useSequentialRuns({ onStop }));
    await act(async () => { await result.current.runAll(["a", "b", "c", "d"]); });
    expect(clientMocks.runAction.mock.calls.map((call) => call[0])).toEqual(["a", "b"]);
    // A refusal that stopped the loop is its own state, never a failure (final review G3).
    expect(result.current.rows).toEqual({ a: "draft_ready", b: "paused" });
    expect(result.current.rows.c).toBeUndefined();
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledWith(reason);
  });

  it("does not stop on an ordinary failure", async () => {
    clientMocks.runAction.mockResolvedValueOnce(FAILED).mockResolvedValueOnce({ ok: false, status: 500, error: "http_500" }).mockResolvedValue(READY);
    const onStop = vi.fn();
    const { result } = renderHook(() => useSequentialRuns({ onStop }));
    await act(async () => { await result.current.runAll(["a", "b", "c"]); });
    expect(clientMocks.runAction).toHaveBeenCalledTimes(3);
    expect(onStop).not.toHaveBeenCalled();
  });

  it("runs every row when stopOnRefusal is false", async () => {
    clientMocks.runAction.mockResolvedValueOnce(BUDGET).mockResolvedValueOnce(READY);
    const onStop = vi.fn();
    const { result } = renderHook(() => useSequentialRuns({ onStop, stopOnRefusal: false }));
    await act(async () => { await result.current.runAll(["a", "b"]); });
    expect(result.current.rows).toEqual({ a: "failed", b: "draft_ready" });
    expect(onStop).not.toHaveBeenCalled();
  });

  it("a refused retry is paused and reported once, not failed", async () => {
    clientMocks.runAction.mockResolvedValue(PAUSED);
    const onStop = vi.fn();
    const { result } = renderHook(() => useSequentialRuns({ onStop }));
    await act(async () => { await result.current.retry("b"); });
    expect(result.current.rows).toEqual({ b: "paused" });
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledWith("ai_paused");
  });

  it("runs a paused row again when the loop is continued", async () => {
    clientMocks.runAction.mockResolvedValueOnce(PAUSED).mockResolvedValue(READY);
    const { result } = renderHook(() => useSequentialRuns());
    await act(async () => { await result.current.runAll(["a", "b"]); });
    expect(result.current.rows).toEqual({ a: "paused" });
    await act(async () => { await result.current.runAll(["a", "b"]); });
    expect(clientMocks.runAction.mock.calls.map((call) => call[0])).toEqual(["a", "a", "b"]);
    expect(result.current.rows).toEqual({ a: "draft_ready", b: "draft_ready" });
  });

  it("skips an action retried before the loop reached it, so it is never run twice (final review G2)", async () => {
    let finishFirst!: (value: unknown) => void;
    clientMocks.runAction.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; })).mockResolvedValue(READY);
    const { result } = renderHook(() => useSequentialRuns());
    let done!: Promise<void>;
    await act(async () => { done = result.current.runAll(["a", "b", "c"]); });
    await act(async () => { await result.current.retry("b"); });
    await act(async () => { finishFirst(READY); await done; });
    expect(clientMocks.runAction.mock.calls.map((call) => call[0])).toEqual(["a", "b", "c"]);
    expect(result.current.rows).toEqual({ a: "draft_ready", b: "draft_ready", c: "draft_ready" });
  });

  it("is running while a loop or a retry is in flight, and not after", async () => {
    let finish!: (value: unknown) => void;
    const pending = () => new Promise((resolve) => { finish = resolve; });
    clientMocks.runAction.mockImplementationOnce(pending).mockImplementationOnce(pending).mockResolvedValue(READY);
    const { result } = renderHook(() => useSequentialRuns());
    expect(result.current.running).toBe(false);
    let done!: Promise<void>;
    await act(async () => { done = result.current.runAll(["a"]); });
    expect(result.current.running).toBe(true);
    await act(async () => { finish(READY); await done; });
    expect(result.current.running).toBe(false);
    await act(async () => { done = result.current.retry("b"); });
    expect(result.current.running).toBe(true);
    await act(async () => { finish(READY); await done; });
    expect(result.current.running).toBe(false);
  });

  it("retry runs only that action", async () => {
    clientMocks.runAction.mockResolvedValue(READY);
    const { result } = renderHook(() => useSequentialRuns());
    await act(async () => { await result.current.retry("b"); });
    expect(clientMocks.runAction.mock.calls.map((call) => call[0])).toEqual(["b"]);
    expect(result.current.rows).toEqual({ b: "draft_ready" });
  });
});
