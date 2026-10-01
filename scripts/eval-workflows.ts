import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { AGENTS, AGENT_LLM_OPTIONS, computeCostUsd } from "@/lib/agents";
import type { llmComplete } from "@/lib/llm";
import type { CorpusCase } from "@/test/corpus/workflows/harness";

/**
 * Opt-in real-model evaluation of the supported workflows (P4.4).
 *
 * Built, not run (DEC-04): it spends real provider money, so it is refused
 * unless EVAL_LIVE=1, an LLM key and an explicit --budget-usd are all present.
 * It is excluded from `test` and CI, opens no database connection, and never
 * prints a key or a full URL. runEval is pure; only the CLI entry writes a file,
 * and only under eval-results/.
 */

type Env = Record<string, string | undefined>;

export type EvalArgs =
  | { ok: true; budgetUsd: number }
  | { ok: false; reason: "not_enabled" | "no_llm_key" | "bad_budget" };

const KEY_NAMES = ["OPENCODE_API_KEY", "LLM_API_KEY", "OPENROUTER_KEY"] as const;

/** Refusal order is deliberate: enablement, then key, then budget. */
export function parseEvalArgs(argv: string[], env: Env): EvalArgs {
  if (env.EVAL_LIVE !== "1") return { ok: false, reason: "not_enabled" };
  if (!KEY_NAMES.some((name) => (env[name] ?? "").trim().length > 0)) return { ok: false, reason: "no_llm_key" };
  const at = argv.indexOf("--budget-usd");
  const raw = at === -1 ? undefined : argv[at + 1];
  const budgetUsd = raw === undefined || raw.trim() === "" ? Number.NaN : Number(raw);
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) return { ok: false, reason: "bad_budget" };
  return { ok: true, budgetUsd };
}

export interface EvalResult {
  id: string;
  pass: boolean;
  notes: string[];
}

export interface EvalReport {
  model: string | null;
  baseUrlHost: string | null;
  options: typeof AGENT_LLM_OPTIONS;
  /** Agent key to promptVersion, so a result file says which prompts were judged. */
  promptVersions: Record<string, string>;
  date: string;
  totalCostUsd: number;
  stoppedForBudget: boolean;
  results: EvalResult[];
}

export interface EvalDeps {
  cases: CorpusCase[];
  llm: typeof llmComplete;
  budgetUsd: number;
  now: () => Date;
  /** Only used to record which model and host were configured. Defaults to process.env. */
  env?: Env;
  /** The cost model; defaults to lib/agents' computeCostUsd. Injected so a null (unpriced) estimate is testable. */
  costUsd?: typeof computeCostUsd;
}

function hostOf(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.trim()).host || null;
  } catch {
    return null;
  }
}

export async function runEval(deps: EvalDeps): Promise<EvalReport> {
  // Loaded on demand so a refused invocation never pulls in the run pipeline.
  const { runCorpusCase } = await import("@/test/corpus/workflows/harness");
  const env = deps.env ?? process.env;
  const costUsd = deps.costUsd ?? computeCostUsd;
  let total = 0;
  // The dearest call seen so far. Every call is also pre-flighted against a worst-case estimate
  // (characters >= tokens, so this over-estimates), which guards the very first call too.
  let dearestCall = 0;
  let refused = false;
  let unpriced = false;
  // Set when a case's first call was refused because its estimate was unknown.
  let refusedUnpriced = false;
  let halted = false;
  let stoppedForBudget = false;
  const overBudget = (estimate: number) => total + Math.max(dearestCall, estimate) > deps.budgetUsd;

  const budgetedLlm = (async (prompt, options) => {
    // An unknown cost means the budget can no longer be enforced: fail closed.
    if (halted) return null;
    const estimate = costUsd({ inputTokens: prompt.length, outputTokens: options?.maxTokens ?? AGENT_LLM_OPTIONS.maxTokens });
    // No pre-flight estimate (pricing unconfigured): the budget cannot be
    // checked before spending, so refuse this call and every later one.
    if (estimate === null) {
      unpriced = true;
      refusedUnpriced = true;
      halted = true;
      return null;
    }
    if (overBudget(estimate)) {
      refused = true;
      return null;
    }
    const result = await deps.llm(prompt, options);
    if (result) {
      const cost = costUsd(result.usage);
      if (cost === null) {
        unpriced = true;
        halted = true;
      } else {
        total += cost;
        dearestCall = Math.max(dearestCall, cost);
      }
    }
    return result;
  }) as typeof llmComplete;

  const results: EvalResult[] = [];
  for (const c of deps.cases) {
    if (halted || overBudget(0)) {
      stoppedForBudget = true;
      break;
    }
    refused = false;
    refusedUnpriced = false;
    const notes: string[] = [];
    // missing_facts cases are blocked by the gate before any model call, so they are a gate result, not a model result.
    if (c.category === "missing_facts") notes.push("gate");
    let pass: boolean;
    try {
      const { result, finishInput, llmCalls } = await runCorpusCase(c, budgetedLlm);
      const warnings = finishInput.output?.warnings ?? [];
      pass = (c.expect.warningsExclude ?? []).every((w) => !warnings.includes(w));
      if (c.category === "missing_facts" && llmCalls > 0) {
        pass = false;
        notes.push("gate_did_not_block");
      }
      if (result.state === "failed") notes.push("run_failed");
    } catch (error) {
      pass = false;
      notes.push(`error:${error instanceof Error ? error.name : "unknown"}`);
    }
    if (refused) {
      pass = false;
      stoppedForBudget = true;
      notes.push("budget_refused");
    }
    if (unpriced) {
      // A case whose model was never called cannot pass.
      if (refusedUnpriced) pass = false;
      stoppedForBudget = true;
      notes.push("cost_unknown");
    }
    results.push({ id: c.id, pass, notes });
    if (stoppedForBudget) break;
  }

  return {
    model: env.LLM_MODEL?.trim() || null,
    baseUrlHost: hostOf(env.LLM_BASE_URL),
    options: AGENT_LLM_OPTIONS,
    promptVersions: Object.fromEntries(Object.values(AGENTS).map((agent) => [agent.key, agent.promptVersion])),
    date: deps.now().toISOString().slice(0, 10),
    totalCostUsd: Math.round(total * 1e6) / 1e6,
    stoppedForBudget,
    results,
  };
}

function summaryLine(report: EvalReport): string {
  const passed = report.results.filter((r) => r.pass).length;
  return [
    `model=${report.model ?? "unknown"}`,
    `date=${report.date}`,
    `pass ${passed}/${report.results.length}`,
    `cost=$${report.totalCostUsd.toFixed(4)}`,
    report.stoppedForBudget ? "stopped_for_budget" : null,
  ]
    .filter(Boolean)
    .join(" ");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  // --check-load proves the live path's imports resolve. It bypasses the gates
  // because it never calls a model, and it needs no key.
  if (argv.includes("--check-load")) {
    const { loadCorpus } = await import("@/test/corpus/workflows/harness");
    await import("@/lib/llm");
    console.log(`load ok: ${loadCorpus().length} cases`);
    return;
  }
  const args = parseEvalArgs(argv, process.env);
  if (!args.ok) {
    console.error(`eval:workflows refused: ${args.reason}`);
    process.exit(2);
  }
  const { loadCorpus } = await import("@/test/corpus/workflows/harness");
  const { llmComplete } = await import("@/lib/llm");
  const report = await runEval({ cases: loadCorpus(), llm: llmComplete, budgetUsd: args.budgetUsd, now: () => new Date() });
  const slug = (report.model ?? "unknown").replace(/[^A-Za-z0-9._-]/g, "_");
  mkdirSync("eval-results", { recursive: true });
  writeFileSync(`eval-results/${report.date}-${slug}.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(summaryLine(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`eval:workflows failed: ${error instanceof Error ? error.name : "unknown"}`);
    process.exit(1);
  });
}
