import { describe, expect, it } from "vitest";
import { beginProviderUsage, settleProviderUsage } from "./provider-usage";
const startedAt = "2026-10-17T08:00:00.000Z", finishedAt = "2026-10-17T08:00:01.000Z";
const begin = () => beginProviderUsage(null, { id: "attempt-1", model: "fixture", startedAt });
const measured = { state: "reported" as const, usage: { inputTokens: 17, outputTokens: 9 }, providerRequestId: "provider-1" };

describe("provider attempt usage", () => {
  it("records uncertainty before outbound work, never a zero total", () => {
    expect(begin()).toMatchObject({ status: "pending", inputTokens: null, outputTokens: null, costUsd: null,
      attempts: { "attempt-1": { state: "pending", usage: { inputTokens: null, outputTokens: null } } } });
  });
  it("settles late measured usage once and preserves request identity", () => {
    const settled = settleProviderUsage(begin(), "attempt-1", { ...measured, late: true }, finishedAt);
    expect(settled).toMatchObject({ status: "complete", inputTokens: 17, outputTokens: 9,
      knownInputTokens: 17, knownOutputTokens: 9, attempts: { "attempt-1": { providerRequestId: "provider-1", late: true } } });
    expect(settleProviderUsage(settled, "attempt-1", measured, finishedAt)).toEqual(settled);
    expect(() => settleProviderUsage(settled, "attempt-1", { ...measured, usage: { inputTokens: 18, outputTokens: 9 } }, finishedAt)).toThrow();
  });
  it("keeps known subtotals when another attempt is unknown", () => {
    let usage = settleProviderUsage(begin(), "attempt-1", measured, finishedAt);
    usage = beginProviderUsage(usage, { id: "attempt-2", model: "fixture", startedAt });
    usage = settleProviderUsage(usage, "attempt-2", { state: "unknown", reason: "settlement_timeout", usage: { inputTokens: null, outputTokens: null } }, finishedAt);
    expect(usage).toMatchObject({ status: "unknown", inputTokens: null, outputTokens: null, costUsd: null,
      knownInputTokens: 17, knownOutputTokens: 9 });
  });
  it("permits a later trusted reconciliation without double counting", () => {
    const unknown = settleProviderUsage(begin(), "attempt-1", { state: "unknown", usage: { inputTokens: null, outputTokens: null } }, finishedAt);
    expect(settleProviderUsage(unknown, "attempt-1", measured, finishedAt)).toMatchObject({ status: "complete", inputTokens: 17, outputTokens: 9 });
  });
  it("retains an identical unknown observation under replay", () => {
    const observation = { state: "unknown" as const, usage: { inputTokens: null, outputTokens: null }, reason: "settlement_timeout" };
    const first = settleProviderUsage(begin(), "attempt-1", observation, finishedAt);
    expect(settleProviderUsage(first, "attempt-1", observation, "2026-10-17T08:00:02.000Z")).toEqual(first);
  });
  it("does not invent the missing dimension of partial usage", () => {
    expect(settleProviderUsage(begin(), "attempt-1", { state: "reported", usage: { inputTokens: null, outputTokens: 9 } }, finishedAt))
      .toMatchObject({ status: "partial", inputTokens: null, outputTokens: 9, costUsd: null, knownOutputTokens: 9 });
  });
  it("records zero cost for official free LongCat rather than the generic estimate", () => {
    const free = beginProviderUsage(null, { id: "attempt-1", model: "longcat-2.5-preview-free", startedAt });
    expect(settleProviderUsage(free, "attempt-1", measured, finishedAt))
      .toMatchObject({ costUsd: 0, knownCostUsd: 0, inputTokens: 17, outputTokens: 9 });
  });
  it("rejects an observation without its prior reservation", () => {
    expect(() => settleProviderUsage(begin(), "foreign-attempt", measured, finishedAt)).toThrow();
  });
});
