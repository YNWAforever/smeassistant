import { readBudgetConfig, type BudgetConfig } from "./config";
import { logBudgetCheckFailed, logBudgetRefusal } from "./log";

/**
 * AI spend budget (P3.5a). The unit is the US$ cost_usd already recorded on
 * action_runs. No provider price is invented, and a run that recorded no
 * cost counts as zero.
 *
 * A pre-check: a run that starts under the limit may finish above it by that
 * run's own cost. Runs are bounded (at most 2 model calls, maxTokens 1200),
 * so the overshoot is at most one run per concurrent request.
 */
export interface AiSpend {
  globalUsd: number;
  workspaceUsd: number;
}

export type AiBudgetScope = "ai_global" | "ai_workspace";
export type AiBudgetDecision = { allowed: true } | { allowed: false; scope: AiBudgetScope };

/** Thrown by the assistant's draft path; the message is the route's error code. */
export class AiBudgetRefusal extends Error {
  readonly code = "ai_budget_reached";
  constructor(readonly scope: AiBudgetScope) {
    super("ai_budget_reached");
    this.name = "AiBudgetRefusal";
  }
}

/** Any failure to evaluate the budget refuses. Call it before llmComplete. */
export async function checkAiBudget(
  readSpend: () => Promise<AiSpend>,
  input: { entry: "ai_run" | "assistant_draft" },
  env: Record<string, string | undefined> = process.env,
): Promise<AiBudgetDecision> {
  let config: BudgetConfig;
  try {
    config = readBudgetConfig(env);
  } catch {
    logBudgetCheckFailed(input.entry, "configuration");
    return { allowed: false, scope: "ai_global" };
  }
  if (config.aiUsdGlobal24h === null && config.aiUsdWorkspace24h === null) return { allowed: true };
  let spend: AiSpend;
  try {
    spend = await readSpend();
    if (!Number.isFinite(spend.globalUsd) || !Number.isFinite(spend.workspaceUsd)) throw new Error("ai_spend_invalid");
  } catch {
    logBudgetCheckFailed(input.entry, "query");
    return { allowed: false, scope: "ai_global" };
  }
  if (config.aiUsdGlobal24h !== null && spend.globalUsd >= config.aiUsdGlobal24h) {
    logBudgetRefusal("ai_global", input.entry, spend.globalUsd, config.aiUsdGlobal24h);
    return { allowed: false, scope: "ai_global" };
  }
  if (config.aiUsdWorkspace24h !== null && spend.workspaceUsd >= config.aiUsdWorkspace24h) {
    logBudgetRefusal("ai_workspace", input.entry, spend.workspaceUsd, config.aiUsdWorkspace24h);
    return { allowed: false, scope: "ai_workspace" };
  }
  return { allowed: true };
}
