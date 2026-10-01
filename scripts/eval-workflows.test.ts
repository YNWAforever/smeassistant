import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parseEvalArgs, runEval } from "./eval-workflows";
import { cannedLlm, loadCorpus, type CorpusCase } from "@/test/corpus/workflows/harness";
import type { llmComplete, LLMResult } from "@/lib/llm";

const LIVE = { EVAL_LIVE: "1", OPENCODE_API_KEY: "test-key-not-real" };

describe("parseEvalArgs", () => {
  it("refuses without EVAL_LIVE=1", () => {
    expect(parseEvalArgs(["--budget-usd", "1"], {})).toEqual({ ok: false, reason: "not_enabled" });
    expect(parseEvalArgs(["--budget-usd", "1"], { ...LIVE, EVAL_LIVE: "true" })).toEqual({
      ok: false,
      reason: "not_enabled",
    });
  });

  it("refuses without an LLM key", () => {
    expect(parseEvalArgs(["--budget-usd", "1"], { EVAL_LIVE: "1" })).toEqual({ ok: false, reason: "no_llm_key" });
    expect(parseEvalArgs(["--budget-usd", "1"], { EVAL_LIVE: "1", OPENCODE_API_KEY: "  " })).toEqual({
      ok: false,
      reason: "no_llm_key",
    });
  });

  it("accepts any one of the three key names", () => {
    for (const name of ["OPENCODE_API_KEY", "LLM_API_KEY", "OPENROUTER_KEY"]) {
      expect(parseEvalArgs(["--budget-usd", "2.5"], { EVAL_LIVE: "1", [name]: "k" })).toEqual({
        ok: true,
        budgetUsd: 2.5,
      });
    }
  });

  it("refuses a missing, zero or negative budget", () => {
    for (const argv of [[], ["--budget-usd"], ["--budget-usd", "0"], ["--budget-usd", "-1"], ["--budget-usd", "abc"], ["--budget-usd", "Infinity"]]) {
      expect(parseEvalArgs(argv, LIVE), argv.join(" ")).toEqual({ ok: false, reason: "bad_budget" });
    }
  });

  it("checks the enable flag before the key and the key before the budget", () => {
    expect(parseEvalArgs([], {})).toEqual({ ok: false, reason: "not_enabled" });
    expect(parseEvalArgs([], { EVAL_LIVE: "1" })).toEqual({ ok: false, reason: "no_llm_key" });
  });
});

const VALID_OUTPUT = JSON.stringify({
  title: "t",
  body: "Thank you for the feedback. We will look into it.",
  acceptance_criteria: ["a"],
  warnings: [],
  facts_used: [],
  facts_needed: [],
});

function modelCase(): CorpusCase {
  const c = loadCorpus().find((x) => x.category !== "missing_facts" && x.expect.llmCalls > 0);
  if (!c) throw new Error("no model case in corpus");
  return c;
}

function costingLlm(costUsd: number) {
  // computeCostUsd rates: $0.0002 in / $0.0008 out per 1K tokens, so scale output tokens to hit the cost.
  const outputTokens = Math.round((costUsd / 0.0008) * 1000);
  const calls = vi.fn(async () => ({ text: VALID_OUTPUT, usage: { inputTokens: 0, outputTokens } }) satisfies LLMResult);
  return { llm: calls as unknown as typeof llmComplete, calls };
}

describe("runEval", () => {
  const now = () => new Date("2026-10-01T03:04:05.000Z");

  it("stops before the budget is passed", async () => {
    const c = modelCase();
    const { llm, calls } = costingLlm(0.6);
    const report = await runEval({ cases: [c, { ...c, id: "second" }, { ...c, id: "third" }], llm, budgetUsd: 1, now });
    expect(report.stoppedForBudget).toBe(true);
    expect(report.results.map((r) => r.id)).toEqual([c.id]);
    expect(calls.mock.calls.length).toBe(1);
    expect(report.totalCostUsd).toBeCloseTo(0.6, 5);
    expect(report.totalCostUsd).toBeLessThan(1);
  });

  it("never calls the model once the running total reaches the budget", async () => {
    const c = modelCase();
    const { llm, calls } = costingLlm(1.5);
    const report = await runEval({ cases: [c, { ...c, id: "second" }], llm, budgetUsd: 1, now });
    expect(report.stoppedForBudget).toBe(true);
    expect(calls.mock.calls.length).toBe(1);
  });

  it("does not stop when everything fits in the budget", async () => {
    const c = modelCase();
    const { llm } = costingLlm(0.1);
    const report = await runEval({ cases: [c, { ...c, id: "second" }], llm, budgetUsd: 5, now });
    expect(report.stoppedForBudget).toBe(false);
    expect(report.results).toHaveLength(2);
    expect(report.totalCostUsd).toBeCloseTo(0.2, 5);
  });

  it("records the model, host only, options and date, and does not touch the filesystem", async () => {
    const before = existsSync("eval-results");
    const c = modelCase();
    const env = { LLM_MODEL: "some-model", LLM_BASE_URL: "https://gateway.example.test/zen/v1?key=nope" };
    const report = await runEval({ cases: [c], llm: cannedLlm([VALID_OUTPUT, VALID_OUTPUT]), budgetUsd: 1, now, env });
    expect(report.date).toBe("2026-10-01");
    expect(report.model).toBe("some-model");
    expect(report.baseUrlHost).toBe("gateway.example.test");
    expect(JSON.stringify(report)).not.toContain("nope");
    expect(report.options).toEqual({ jsonMode: true, temperature: 0.4, maxTokens: 1200, timeoutMs: 45_000 });
    // runEval returns the report; writing is the CLI entry's job only.
    expect(existsSync("eval-results")).toBe(before);
    const blank = await runEval({ cases: [], llm: cannedLlm([]), budgetUsd: 1, now, env: {} });
    expect(blank.model).toBeNull();
    expect(blank.baseUrlHost).toBeNull();
  });

  it("reports missing_facts cases as passing by the gate without calling the model", async () => {
    const c = loadCorpus().find((x) => x.category === "missing_facts");
    if (!c) throw new Error("no missing_facts case");
    const { llm, calls } = costingLlm(0.6);
    const report = await runEval({ cases: [c], llm, budgetUsd: 1, now });
    expect(calls).not.toHaveBeenCalled();
    expect(report.results).toEqual([{ id: c.id, pass: true, notes: ["gate"] }]);
  });

  it("fails a case whose output carries a warning the case excludes", async () => {
    const c = { ...modelCase(), expect: { ...modelCase().expect, warningsExclude: ["bad_warning"] } };
    const output = JSON.stringify({ ...JSON.parse(VALID_OUTPUT), warnings: ["bad_warning"] });
    const report = await runEval({ cases: [c], llm: cannedLlm([output, output]), budgetUsd: 1, now });
    expect(report.results[0].pass).toBe(false);
  });
});

describe("runEval fail-closed budget", () => {
  const now = () => new Date("2026-10-01T03:04:05.000Z");

  it("refuses the very first call when the budget cannot cover a worst-case call, with zero spend", async () => {
    const c = modelCase();
    const { llm, calls } = costingLlm(0.0001);
    const report = await runEval({ cases: [c, { ...c, id: "second" }], llm, budgetUsd: 1e-9, now });
    expect(calls).not.toHaveBeenCalled();
    expect(report.totalCostUsd).toBe(0);
    expect(report.stoppedForBudget).toBe(true);
    expect(report.results).toHaveLength(1);
    expect(report.results[0]).toMatchObject({ pass: false });
    expect(report.results[0].notes).toContain("budget_refused");
  });

  it("stops the run on the first result whose cost is unknown", async () => {
    const c = modelCase();
    const calls = vi.fn(async () => ({ text: VALID_OUTPUT, usage: { inputTokens: null, outputTokens: null } }) satisfies LLMResult);
    const report = await runEval({
      cases: [c, { ...c, id: "second" }, { ...c, id: "third" }],
      llm: calls as unknown as typeof llmComplete,
      budgetUsd: 1000,
      now,
    });
    expect(report.stoppedForBudget).toBe(true);
    expect(report.results.map((r) => r.id)).toEqual([c.id]);
    expect(report.results[0].notes).toContain("cost_unknown");
    // No second call, not even a retry inside the same case.
    expect(calls.mock.calls.length).toBe(1);
  });

  it("refuses the call up front when the pre-flight estimate is unknown (pricing unconfigured), noting cost_unknown", async () => {
    const c = modelCase();
    const { llm, calls } = costingLlm(0.0001);
    const report = await runEval({ cases: [c, { ...c, id: "second" }], llm, budgetUsd: 1000, now, costUsd: () => null });
    expect(calls).not.toHaveBeenCalled();
    expect(report.totalCostUsd).toBe(0);
    expect(report.stoppedForBudget).toBe(true);
    expect(report.results).toHaveLength(1);
    expect(report.results[0]).toMatchObject({ id: c.id, pass: false });
    expect(report.results[0].notes).toContain("cost_unknown");
  });

  it("records the prompt version of every agent", async () => {
    const { AGENTS } = await import("@/lib/agents");
    const report = await runEval({ cases: [], llm: cannedLlm([]), budgetUsd: 1, now });
    expect(Object.keys(report.promptVersions).sort()).toEqual(Object.keys(AGENTS).sort());
    for (const [key, version] of Object.entries(report.promptVersions)) {
      expect(version, key).toBe(AGENTS[key as keyof typeof AGENTS].promptVersion);
      expect(version.length).toBeGreaterThan(0);
    }
  });
});
