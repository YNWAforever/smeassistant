import { describe, expect, it } from "vitest";

import { evaluateStudioUsageBudgets, parseStudioUsageArgs } from "./studio-usage";

const NOW = new Date("2026-11-09T00:00:00.000Z");
const UUID = "11111111-1111-4111-8111-111111111111";

describe("parseStudioUsageArgs", () => {
  it("defaults to 30 days across all workspaces", () => {
    const { options, help } = parseStudioUsageArgs([], NOW);
    expect(help).toBe(false);
    expect(options.workspaceId).toBeUndefined();
    expect(options.since.toISOString()).toBe("2026-10-10T00:00:00.000Z");
  });

  it("accepts a bounded window and a workspace UUID", () => {
    const { options } = parseStudioUsageArgs(["--days", "7", "--workspace-id", UUID.toUpperCase()], NOW);
    expect(options.workspaceId).toBe(UUID);
    expect(options.since.toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });

  it("reports help and rejects malformed input", () => {
    expect(parseStudioUsageArgs(["--help"], NOW).help).toBe(true);
    for (const argv of [
      ["--days", "0"],
      ["--days", "366"],
      ["--days", "nope"],
      ["--workspace-id", "not-a-uuid"],
      ["--max-cost-usd", "-1"],
      ["--max-cost-usd", "nope"],
      ["--max-cost-usd"],
      ["--max-p95-ms", "-1"],
      ["--max-p95-ms", "Infinity"],
      ["--max-p95-ms"],
      ["--unknown"],
      ["--days"],
    ]) {
      expect(() => parseStudioUsageArgs(argv, NOW)).toThrow();
    }
  });

  it("accepts cost and p95 latency budgets", () => {
    const { options } = parseStudioUsageArgs(["--max-cost-usd", "5.5", "--max-p95-ms", "1200"], NOW);
    expect(options.maxCostUsd).toBe(5.5);
    expect(options.maxP95LatencyMs).toBe(1200);
  });
});

describe("evaluateStudioUsageBudgets", () => {
  const usage = { costUsd: 12.5, p95: 900 };

  it("reports no thresholds and no breaches when budgets are absent", () => {
    expect(evaluateStudioUsageBudgets(usage, {})).toEqual({ maxCostUsd: null, maxP95LatencyMs: null, breaches: [] });
  });

  it("breaches cost only when it strictly exceeds the threshold", () => {
    expect(evaluateStudioUsageBudgets(usage, { maxCostUsd: 12.5 }).breaches).toEqual([]);
    expect(evaluateStudioUsageBudgets(usage, { maxCostUsd: 10 }).breaches).toEqual(["cost"]);
  });

  it("breaches p95 only when a p95 sample exists and exceeds the threshold", () => {
    expect(evaluateStudioUsageBudgets(usage, { maxP95LatencyMs: 900 }).breaches).toEqual([]);
    expect(evaluateStudioUsageBudgets(usage, { maxP95LatencyMs: 800 }).breaches).toEqual(["p95_latency"]);
    expect(evaluateStudioUsageBudgets({ costUsd: 0, p95: null }, { maxP95LatencyMs: 1 }).breaches).toEqual([]);
  });

  it("reports both breaches in a stable order", () => {
    expect(evaluateStudioUsageBudgets(usage, { maxCostUsd: 1, maxP95LatencyMs: 1 }).breaches).toEqual(["cost", "p95_latency"]);
  });
});
