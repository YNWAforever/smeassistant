import type { WebsiteChecks } from "@/lib/website/checks";

/**
 * Module states for the workspace (CLAUDE.md §3.5.1).
 *
 * Sourced from `audit_jobs.module_results` written by scan-engine; legacy rows
 * that only carry `module_scores` fall back to `measured` / `low`, exactly as
 * `lib/report/load-report.ts` does, so the workspace and the report never
 * disagree about whether a channel was measured. `website` is display-only and
 * derived from this app's website checks. `pending` exists only while the job
 * is still running.
 */
export type ProviderState = "measured" | "unavailable" | "unsupported" | "failed" | "pending";
export type ModuleConfidence = "high" | "medium" | "low" | "none";

export type ModuleStateKey = "google_business" | "instagram" | "search_ai" | "website";

export interface ModuleState {
  status: ProviderState;
  confidence: ModuleConfidence;
  limitationCode: string | null;
  score: number | null;
}

export type ModuleStates = Record<ModuleStateKey, ModuleState>;

export const PRIMARY_SOURCES: ModuleStateKey[] = ["google_business", "instagram", "search_ai", "website"];

export const ENGINE_MODULE: Record<Exclude<ModuleStateKey, "website">, "ig" | "gbp" | "aeo"> = {
  instagram: "ig",
  google_business: "gbp",
  search_ai: "aeo",
};

const TERMINAL_STATUSES = new Set(["done", "partial", "failed"]);

interface EngineModuleResult {
  status?: string;
  score?: number | null;
  confidence?: string;
  limitationCode?: string | null;
}

export interface ModuleStateJob {
  status: string;
  module_results: unknown;
  module_scores: unknown;
}

function isProviderState(value: unknown): value is Exclude<ProviderState, "pending"> {
  return value === "measured" || value === "unavailable" || value === "unsupported" || value === "failed";
}

function isConfidence(value: unknown): value is ModuleConfidence {
  return value === "high" || value === "medium" || value === "low" || value === "none";
}

function engineState(job: ModuleStateJob, module: "ig" | "gbp" | "aeo", terminal: boolean): ModuleState {
  const results = (job.module_results ?? null) as Record<string, EngineModuleResult | undefined> | null;
  const result = results && typeof results === "object" ? results[module] : undefined;
  if (result && isProviderState(result.status)) {
    return {
      status: result.status,
      score: result.status === "measured" && typeof result.score === "number" ? result.score : null,
      confidence: isConfidence(result.confidence) ? result.confidence : "none",
      limitationCode: typeof result.limitationCode === "string" ? result.limitationCode : null,
    };
  }
  const scores = (job.module_scores ?? null) as Record<string, { score?: unknown } | undefined> | null;
  const legacyScore = scores && typeof scores === "object" ? scores[module]?.score : undefined;
  if (typeof legacyScore === "number") {
    return { status: "measured", score: legacyScore, confidence: "low", limitationCode: null };
  }
  if (!terminal) return { status: "pending", score: null, confidence: "none", limitationCode: null };
  return { status: "unavailable", score: null, confidence: "none", limitationCode: `${module.toUpperCase()}_NOT_MEASURED` };
}

export function websiteState(websiteChecks: WebsiteChecks | null, websiteUrlGiven: boolean): ModuleState {
  if (!websiteUrlGiven) return { status: "unsupported", score: null, confidence: "none", limitationCode: "WEBSITE_URL_NOT_PROVIDED" };
  if (!websiteChecks || websiteChecks.evaluated === 0) {
    return { status: "unavailable", score: null, confidence: "none", limitationCode: "WEBSITE_UNREACHABLE" };
  }
  return { status: "measured", score: null, confidence: "high", limitationCode: null };
}

export function deriveModuleStates(job: ModuleStateJob, websiteChecks: WebsiteChecks | null, websiteUrlGiven: boolean): ModuleStates {
  const terminal = TERMINAL_STATUSES.has(job.status);
  return {
    google_business: engineState(job, ENGINE_MODULE.google_business, terminal),
    instagram: engineState(job, ENGINE_MODULE.instagram, terminal),
    search_ai: engineState(job, ENGINE_MODULE.search_ai, terminal),
    website: websiteState(websiteChecks, websiteUrlGiven),
  };
}

/** "3 of 4 primary sources" — measured count among the four display sources (§3.5.2). */
export function measuredPrimarySources(states: ModuleStates): { measured: number; total: number } {
  return { measured: PRIMARY_SOURCES.filter((key) => states[key].status === "measured").length, total: PRIMARY_SOURCES.length };
}
