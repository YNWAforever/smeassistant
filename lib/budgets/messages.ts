import { t } from "@/lib/i18n";

/**
 * Spend-budget refusals as people see them (P3.5a), plus the incident
 * kill-switch refusals (P3.5d). The routes answer with fixed error codes;
 * these helpers turn them into lib/messages copy in the reader's locale, and
 * return null for every other failure. Client-safe: no server imports.
 */
export function scanStartRefusal(locale: string, status: number, error: unknown): string | null {
  if (status !== 503) return null;
  // "Not started", not "your scan is saved": every caller of this helper
  // (scan start, business search, IG search) is refused before anything is
  // created. "pause.scans" (Your scan is saved) is reserved for the scanning
  // page's own Resume path, which never calls this helper.
  if (error === "paused") return t(locale, "pause.scansNotStarted");
  return error === "at_capacity" ? t(locale, "budget.scanAtCapacity") : null;
}

export function aiBudgetRefusal(locale: string, status: number, error: unknown): string | null {
  if (status === 503 && error === "ai_paused") return t(locale, "pause.ai");
  return status === 429 && error === "ai_budget_reached" ? t(locale, "budget.aiLimit") : null;
}
