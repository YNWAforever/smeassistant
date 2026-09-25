/**
 * Spend-budget log lines (P3.5a). Fixed text and numbers only: no business
 * names, emails or ids.
 */
export type BudgetScope = "scan_global" | "scan_workspace" | "ai_global" | "ai_workspace";
/**
 * Where the check ran. `retry_claim` is the claim-time gate: it meters every
 * claim that is not an admitted first attempt with a live reservation, so it
 * covers retries and first attempts whose reservation has expired alike.
 */
export type BudgetEntry = "scan_start" | "rescan" | "retry_claim" | "ai_run" | "assistant_draft";

/** The one line every over-limit refusal writes. */
export function logBudgetRefusal(scope: BudgetScope, entry: BudgetEntry, used: number, limit: number): void {
  console.warn("[budget] refused", { scope, entry, used, limit });
}

/**
 * A refusal because the budget could not be evaluated: an invalid
 * configuration, or a count that could not be read. There is no used/limit
 * pair to report, so it is its own fixed line. The work is refused all the
 * same, never let through unmetered.
 */
export function logBudgetCheckFailed(entry: BudgetEntry, reason: "configuration" | "query"): void {
  console.error("[budget] check_failed", { entry, reason });
}
