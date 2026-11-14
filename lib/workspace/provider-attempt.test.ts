import { describe, expect, it, vi } from "vitest";
import type { LLMOptions } from "@/lib/llm";
import { invokeProviderAttempt } from "./provider-attempt";
const attribution = { runId: "run-1", actorId: "actor-1", workspaceId: "workspace-1", locale: "en" };
const measured = { inputTokens: 17, outputTokens: 9 };
function sharedDeadline(consumedMs = 0) {
  const controller = new AbortController();
  const executionBudget = {
    signal: controller.signal,
    remainingMs: () => Math.max(0, 50_000 - consumedMs),
    cleanupRemainingMs: () => Math.max(0, 55_000 - consumedMs),
  };
  return { controller, executionBudget, consume: (ms: number) => { consumedMs += ms; } };
}

describe("provider attempt reservation", () => {
  it.each([false, true])("refuses expired work before reservation (legacy recorder=%s)", async legacy => {
    const persistence = { beginProviderAttempt: vi.fn(), observeProviderAttempt: vi.fn() };
    const call = vi.fn();
    const { executionBudget } = sharedDeadline(50_000);
    const outcome = await invokeProviderAttempt({ persistence: legacy ? {} : persistence, attribution, model: "fixture", options: { executionBudget }, call });
    expect(outcome).toEqual({ ok: false, code: "timeout", retryable: false, usage: { inputTokens: 0, outputTokens: 0 } });
    expect(call).not.toHaveBeenCalled();
    expect(persistence.beginProviderAttempt).not.toHaveBeenCalled();
    expect(persistence.observeProviderAttempt).not.toHaveBeenCalled();
  });

  it("refuses an already-aborted budget with time remaining", async () => {
    const state = sharedDeadline();
    state.controller.abort();
    const persistence = { beginProviderAttempt: vi.fn(), observeProviderAttempt: vi.fn() };
    const call = vi.fn();
    expect(await invokeProviderAttempt({ persistence, attribution, model: "fixture", options: state, call })).toMatchObject({ code: "timeout" });
    expect(persistence.beginProviderAttempt).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });

  it.each(["time", "signal"] as const)("settles a committed but unsent reservation when %s expires", async expiry => {
    const state = sharedDeadline(30_000);
    const persistence = {
      beginProviderAttempt: vi.fn(async () => { if (expiry === "time") state.consume(20_000); else state.controller.abort(); }),
      observeProviderAttempt: vi.fn(async () => {}),
    };
    const call = vi.fn();
    const outcome = await invokeProviderAttempt({ persistence, attribution, model: "fixture", options: state, call });
    expect(call).not.toHaveBeenCalled();
    expect(persistence.beginProviderAttempt).toHaveBeenCalledOnce();
    expect(persistence.observeProviderAttempt).toHaveBeenCalledOnce();
    expect(persistence.observeProviderAttempt).toHaveBeenCalledWith(expect.objectContaining({
      ...attribution, observation: { state: "rejected", usage: { inputTokens: 0, outputTokens: 0 }, reason: "deadline_before_dispatch" },
    }));
    expect(outcome).toEqual({ ok: false, code: "timeout", retryable: false, usage: { inputTokens: 0, outputTokens: 0 } });
  });

  it("charges reservation time to both provider and finalization allowances", async () => {
    const state = sharedDeadline(30_000);
    const persistence = {
      beginProviderAttempt: vi.fn(async () => { state.consume(4000); }),
      observeProviderAttempt: vi.fn(async () => {}),
    };
    const call = vi.fn(async (_options: LLMOptions) => ({ ok: true as const, result: { text: "Reply", usage: measured } }));
    await invokeProviderAttempt({ persistence, attribution, model: "fixture", options: { ...state, timeoutMs: 20_000, usageSettlementTimeoutMs: 25_000 }, call });
    expect(call).toHaveBeenCalledOnce();
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 16_000, usageSettlementTimeoutMs: 21_000, executionBudget: state.executionBudget }));
    expect(state.controller.signal.aborted).toBe(false);
  });

  it("reports pending accounting when recording the known-unsent rejection fails", async () => {
    const state = sharedDeadline(30_000);
    const persistence = {
      beginProviderAttempt: vi.fn(async () => { state.consume(20_000); }),
      observeProviderAttempt: vi.fn(async () => { throw new Error("fixture persistence failure"); }),
    };
    const call = vi.fn();
    const outcome = await invokeProviderAttempt({ persistence, attribution, model: "fixture", options: state, call });
    expect(outcome).toMatchObject({ code: "usage_record_failed", retryable: false, usagePending: true, usage: { inputTokens: 0, outputTokens: 0 } });
    expect(call).not.toHaveBeenCalled();
    expect(persistence.observeProviderAttempt).toHaveBeenCalledOnce();
  });

  it("commits the reservation before invoking the provider and records returned usage", async () => {
    const order: string[] = [];
    const persistence = {
      beginProviderAttempt: vi.fn(async (input: { attemptId: string }) => { expect(input.attemptId).toBeTruthy(); order.push("reserved"); }),
      observeProviderAttempt: vi.fn(async () => { order.push("observed"); }),
    };
    const outcome = await invokeProviderAttempt({ persistence, attribution, model: "fixture", options: {},
      call: async () => { order.push("provider"); return { ok: true, result: { text: "Reply", usage: measured } }; } });
    expect(outcome).toMatchObject({ ok: true });
    expect(order).toEqual(["reserved", "provider", "observed"]);
    expect(persistence.observeProviderAttempt).toHaveBeenCalledWith(expect.objectContaining({
      ...attribution, observation: { state: "reported", usage: measured },
      attemptId: persistence.beginProviderAttempt.mock.calls[0][0].attemptId,
    }));
  });
  it("makes no provider call when reservation cannot be committed", async () => {
    const call = vi.fn();
    await expect(invokeProviderAttempt({
      persistence: { beginProviderAttempt: async () => { throw new Error("db_unavailable"); }, observeProviderAttempt: vi.fn() },
      attribution, model: "fixture", options: {}, call,
    })).rejects.toThrow("db_unavailable");
    expect(call).not.toHaveBeenCalled();
  });
  it("retains the same reservation for a late observation after returning timeout", async () => {
    let options!: LLMOptions;
    const persistence = { beginProviderAttempt: vi.fn(async () => {}), observeProviderAttempt: vi.fn(async () => {}) };
    const outcome = await invokeProviderAttempt({ persistence, attribution, model: "fixture", options: { timeoutMs: 10 },
      call: async value => { options = value; return { ok: false, code: "timeout", retryable: false, usagePending: true }; } });
    expect(outcome).toMatchObject({ ok: false, usagePending: true });
    expect(persistence.observeProviderAttempt).not.toHaveBeenCalled();
    await options.onUsageObservation!({ state: "reported", usage: measured, late: true, providerRequestId: "provider-1" });
    expect(persistence.observeProviderAttempt).toHaveBeenCalledWith(expect.objectContaining({
      ...attribution, observation: expect.objectContaining({ usage: measured, late: true }),
    }));
  });
  it("records thrown transport uncertainty and refuses an automatic retry", async () => {
    const persistence = { beginProviderAttempt: vi.fn(async () => {}), observeProviderAttempt: vi.fn(async () => {}) };
    const call = vi.fn(async (): Promise<never> => { throw new Error("transport"); });
    expect(await invokeProviderAttempt({ persistence, attribution, model: "fixture", options: {}, call }))
      .toMatchObject({ ok: false, retryable: false, usagePending: true });
    expect(call).toHaveBeenCalledTimes(1);
    expect(persistence.observeProviderAttempt).toHaveBeenCalledWith(expect.objectContaining({
      observation: { state: "unknown", reason: "network_error", usage: { inputTokens: null, outputTokens: null } },
    }));
  });
});
