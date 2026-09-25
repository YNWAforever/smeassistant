/**
 * Spend budgets (P3.5a, docs/superpowers/specs/2026-09-25-spend-budgets-design.md).
 *
 * Follows lib/db/config.ts: the environment is a parameter, every value is
 * validated, and a bad value throws a coded error. The error names the
 * variable and never its value.
 *
 * A budget is not a feature flag. Zero is rejected, because "refuse
 * everything" is not a budget; the existing feature flags do that. An empty
 * string is rejected too, so a half-filled .env cannot silently disable a
 * limit. Values are matched exactly, with no trimming.
 */
export const BUDGET_VARIABLES = [
  "BUDGET_SCAN_ATTEMPTS_GLOBAL_24H",
  "BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H",
  "BUDGET_AI_USD_GLOBAL_24H",
  "BUDGET_AI_USD_WORKSPACE_24H",
] as const;
export type BudgetVariable = (typeof BUDGET_VARIABLES)[number];

export interface BudgetConfig {
  /** Scan attempts in a rolling 24 hours, retries included. null = off. */
  scanAttemptsGlobal24h: number | null;
  scanAttemptsWorkspace24h: number | null;
  /** Recorded action_runs.cost_usd (US$) in a rolling 24 hours. null = off. */
  aiUsdGlobal24h: number | null;
  aiUsdWorkspace24h: number | null;
}

/** Placeholders for the owner to review, not commercial decisions. */
export const DEFAULT_SCAN_ATTEMPTS_GLOBAL_24H = 200;
export const DEFAULT_AI_USD_GLOBAL_24H = 20;

export class BudgetConfigurationError extends Error {
  readonly code = "budget_configuration_invalid";
  constructor(readonly variable: BudgetVariable) {
    super(`budget_configuration_invalid: ${variable}`);
    this.name = "BudgetConfigurationError";
  }
}

const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

function readLimit(
  env: Record<string, string | undefined>,
  variable: BudgetVariable,
  kind: "integer" | "decimal",
  fallback: number | null,
): number | null {
  const raw = env[variable];
  if (raw === undefined) return fallback;
  if (raw === "off") return null;
  if (kind === "integer") {
    if (!POSITIVE_INTEGER.test(raw)) throw new BudgetConfigurationError(variable);
    const value = Number(raw);
    if (!Number.isSafeInteger(value)) throw new BudgetConfigurationError(variable);
    return value;
  }
  if (!DECIMAL.test(raw)) throw new BudgetConfigurationError(variable);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new BudgetConfigurationError(variable);
  return value;
}

export function readBudgetConfig(env: Record<string, string | undefined>): BudgetConfig {
  return {
    scanAttemptsGlobal24h: readLimit(env, "BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "integer", DEFAULT_SCAN_ATTEMPTS_GLOBAL_24H),
    scanAttemptsWorkspace24h: readLimit(env, "BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H", "integer", null),
    aiUsdGlobal24h: readLimit(env, "BUDGET_AI_USD_GLOBAL_24H", "decimal", DEFAULT_AI_USD_GLOBAL_24H),
    aiUsdWorkspace24h: readLimit(env, "BUDGET_AI_USD_WORKSPACE_24H", "decimal", null),
  };
}
