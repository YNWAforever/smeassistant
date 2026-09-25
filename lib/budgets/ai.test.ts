import { afterEach, describe, expect, it, vi } from "vitest";

import { AiBudgetRefusal, checkAiBudget } from "./ai";

afterEach(() => vi.restoreAllMocks());

const spend = (globalUsd: number, workspaceUsd: number) => vi.fn(async () => ({ globalUsd, workspaceUsd }));

describe("checkAiBudget", () => {
  it("allows below the default US$20 global limit", async () => {
    expect(await checkAiBudget(spend(19.99, 19.99), { entry: "ai_run" }, {})).toEqual({ allowed: true });
  });

  it("refuses at the global limit with the fixed log line", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await checkAiBudget(spend(20, 0), { entry: "assistant_draft" }, {})).toEqual({ allowed: false, scope: "ai_global" });
    expect(warn).toHaveBeenCalledWith("[budget] refused", { scope: "ai_global", entry: "assistant_draft", used: 20, limit: 20 });
  });

  it("applies a workspace limit only when one is set", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await checkAiBudget(spend(1, 5), { entry: "ai_run" }, {})).toEqual({ allowed: true });
    expect(await checkAiBudget(spend(1, 5), { entry: "ai_run" }, { BUDGET_AI_USD_WORKSPACE_24H: "5" })).toEqual({ allowed: false, scope: "ai_workspace" });
    expect(await checkAiBudget(spend(1, 4.99), { entry: "ai_run" }, { BUDGET_AI_USD_WORKSPACE_24H: "5" })).toEqual({ allowed: true });
  });

  it("reports the global limit first when both are reached", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await checkAiBudget(spend(20, 5), { entry: "ai_run" }, { BUDGET_AI_USD_WORKSPACE_24H: "5" })).toEqual({ allowed: false, scope: "ai_global" });
  });

  it("reads no spend when both AI limits are off", async () => {
    const read = spend(1000, 1000);
    expect(await checkAiBudget(read, { entry: "ai_run" }, { BUDGET_AI_USD_GLOBAL_24H: "off" })).toEqual({ allowed: true });
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    ["the spend read fails", async () => { throw new Error("db down"); }],
    ["the spend read returns nothing", async () => undefined],
    ["the spend is not a number", async () => ({ globalUsd: Number.NaN, workspaceUsd: 0 })],
  ])("refuses, with the check_failed line, when %s", async (_label, read) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await checkAiBudget(read as never, { entry: "ai_run" }, {})).toEqual({ allowed: false, scope: "ai_global" });
    expect(error).toHaveBeenCalledWith("[budget] check_failed", { entry: "ai_run", reason: "query" });
  });

  it("refuses an invalid configuration without reading spend", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const read = spend(0, 0);
    expect(await checkAiBudget(read, { entry: "assistant_draft" }, { BUDGET_AI_USD_GLOBAL_24H: "" })).toEqual({ allowed: false, scope: "ai_global" });
    expect(read).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("[budget] check_failed", { entry: "assistant_draft", reason: "configuration" });
  });
});

describe("AiBudgetRefusal", () => {
  it("carries the route's error code and its scope", () => {
    const refusal = new AiBudgetRefusal("ai_workspace");
    expect(refusal).toBeInstanceOf(Error);
    expect(refusal.message).toBe("ai_budget_reached");
    expect(refusal.code).toBe("ai_budget_reached");
    expect(refusal.scope).toBe("ai_workspace");
  });
});
