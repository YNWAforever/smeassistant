import { describe, expect, it, vi } from "vitest";
import type { LLMOptions } from "@/lib/llm";
import { invokeProviderAttempt } from "./provider-attempt";
const attribution = { runId: "run-1", actorId: "actor-1", workspaceId: "workspace-1", locale: "en" };
const measured = { inputTokens: 17, outputTokens: 9 };

describe("provider attempt reservation", () => {
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
