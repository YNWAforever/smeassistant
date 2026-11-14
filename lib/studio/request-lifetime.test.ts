import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { currentExecutionBudget, scopedBudgetPool } from "@/lib/jobs/execution-budget";
import { runStudioRequest } from "./request-lifetime";

const retained = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock("@vercel/functions", () => ({ waitUntil: (work: Promise<unknown>) => { retained.push(work); } }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const unavailable = () => new Response("unavailable", { status: 503 });
beforeEach(() => { retained.length = 0; });
afterEach(() => vi.useRealTimers());

describe("Studio request resource lifetime", () => {
  it("returns headers while retaining the execution scope through durable completion", async () => {
    const turn = deferred<void>();
    const end = vi.fn(async () => {});
    const cleanup = vi.fn(async () => {});
    const response = await runStudioRequest(async lifetime => {
      expect(currentExecutionBudget()).toBe(lifetime.deadline.work);
      scopedBudgetPool(() => ({ end }) as unknown as Pool);
      lifetime.completeWith(turn.promise);
      lifetime.onFinally(cleanup);
      return new Response("ready");
    }, unavailable);
    expect(await response.text()).toBe("ready");
    expect(end).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
    turn.resolve();
    await Promise.all(retained);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("bounds ignored preflight cancellation and never resumes the next stage", async () => {
    vi.useFakeTimers();
    const auth = deferred<string>();
    const next = vi.fn();
    const pending = runStudioRequest(async lifetime => {
      await lifetime.work(() => auth.promise);
      next();
      return new Response("ready");
    }, unavailable);
    await vi.advanceTimersByTimeAsync(50_000);
    expect((await pending).status).toBe(503);
    auth.resolve("late identity");
    await Promise.all(retained);
    expect(next).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ends retained work and attempts cleanup at the original final cutoff", async () => {
    vi.useFakeTimers();
    const never = new Promise<void>(() => {});
    const cleanup = vi.fn(async () => {});
    const response = await runStudioRequest(async lifetime => {
      lifetime.completeWith(never);
      lifetime.onFinally(cleanup);
      return new Response("ready");
    }, unavailable);
    expect(response.status).toBe(200);
    await vi.advanceTimersByTimeAsync(50_000);
    expect(cleanup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    await Promise.all(retained);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains settlement registered after the response was returned", async () => {
    const turn = deferred<void>();
    const accounting = deferred<void>();
    const cleanup = vi.fn(async () => {});
    await runStudioRequest(async lifetime => {
      lifetime.completeWith(turn.promise.then(() => { lifetime.completeWith(accounting.promise); }));
      lifetime.onFinally(cleanup);
      return new Response("ready");
    }, unavailable);
    turn.resolve();
    await turn.promise;
    expect(cleanup).not.toHaveBeenCalled();
    accounting.resolve();
    await Promise.all(retained);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
