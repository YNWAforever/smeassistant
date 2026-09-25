import { t } from "@/lib/i18n";

/**
 * Spend-budget refusals as people see them (P3.5a). The routes answer with
 * fixed error codes; these helpers turn them into lib/messages copy in the
 * reader's locale, and return null for every other failure. Client-safe: no
 * server imports.
 */
export function scanStartRefusal(locale: string, status: number, error: unknown): string | null {
  return status === 503 && error === "at_capacity" ? t(locale, "budget.scanAtCapacity") : null;
}

export function aiBudgetRefusal(locale: string, status: number, error: unknown): string | null {
  return status === 429 && error === "ai_budget_reached" ? t(locale, "budget.aiLimit") : null;
}
