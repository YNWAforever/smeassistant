/**
 * Pure helpers behind the scanning page: stage → progress, stage → collector
 * cards, poll backoff and the scan reference. Shapes follow upstream's
 * GET /api/scan/status response and ScanStage vocabulary (CLAUDE.md §3.2.2).
 */

export const SCAN_STAGES = ["queued", "collecting", "collecting_ig_gbp", "collecting_aeo", "scoring", "persisting", "done"] as const;
export const SCAN_STAGE_COUNT = 6;

export const INITIAL_POLL_DELAY_MS = 1000;
export const MAX_POLL_DELAY_MS = 8000;
export const POLL_BACKOFF_FACTOR = 1.5;
export const REPORT_REDIRECT_DELAY_MS = 1500;

export type ModuleProviderState = "measured" | "unavailable" | "unsupported" | "failed" | "pending";

export interface ScanStatusResponse {
  status: string;
  shareSlug: string | null;
  processingStage: string | null;
  coverage: number | null;
  failureCorrelationId: string | null;
  moduleStates?: Record<CollectorKey, ModuleProviderState> | null;
}

/** 0.7 -> 70, already-a-percentage values pass through. Mirrors
 * lib/report/view-model.ts's coveragePercent so the scanning page and the
 * report never disagree about what a coverage fraction renders as. */
export function coveragePercent(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const percent = value <= 1 ? value * 100 : value;
  return Math.min(100, Math.max(0, Math.round(percent)));
}

export type TerminalScanStatus = "done" | "partial" | "failed";

export function isTerminalStatus(status: string | null | undefined): status is TerminalScanStatus {
  return status === "done" || status === "partial" || status === "failed";
}

/**
 * 0..6 index of the furthest stage reached. Terminal states count as all six
 * stages complete; unknown strings map to 0 so the bar never jumps backwards
 * on an unexpected value (callers keep the maximum they have seen).
 */
export function stageIndex(processingStage: string | null | undefined, status: string): number {
  if (status === "done" || status === "partial" || status === "failed") return SCAN_STAGE_COUNT;
  const stage = processingStage ?? status;
  const index = (SCAN_STAGES as readonly string[]).indexOf(stage);
  return index < 0 ? 0 : Math.min(index, SCAN_STAGE_COUNT);
}

export function progressPercent(index: number): number {
  return Math.round((Math.min(Math.max(index, 0), SCAN_STAGE_COUNT) / SCAN_STAGE_COUNT) * 100);
}

export type CollectorKey = "google_business" | "instagram" | "search_ai";
export const COLLECTOR_KEYS: CollectorKey[] = ["google_business", "instagram", "search_ai"];

/**
 * pending     — the stage has not started
 * running     — the provider is being read right now
 * done        — this module measured
 * unavailable — the scan reached a terminal state but this module did not measure
 * failed      — the scan failed outright, or (per-module) this module's collector failed
 */
export type CollectorPhase = "pending" | "running" | "done" | "unavailable" | "failed";

/**
 * `moduleStates` (from GET /api/scan/status, only present once terminal) is
 * the real per-module outcome -- reusing it here is what stops a `partial`
 * scan from showing "Measured" for a collector that did not actually measure
 * anything. Without it (still running, or an older response shape), all three
 * collectors fall back to the coarser stage-based phase below.
 */
export function collectorPhases(
  processingStage: string | null | undefined,
  status: string,
  moduleStates?: Record<CollectorKey, ModuleProviderState> | null,
): Record<CollectorKey, CollectorPhase> {
  if ((status === "done" || status === "partial" || status === "failed") && moduleStates) {
    const phaseFor = (state: ModuleProviderState): CollectorPhase =>
      state === "measured" ? "done" : state === "failed" ? "failed" : state === "pending" ? "pending" : "unavailable";
    return {
      google_business: phaseFor(moduleStates.google_business),
      instagram: phaseFor(moduleStates.instagram),
      search_ai: phaseFor(moduleStates.search_ai),
    };
  }
  if (status === "failed") return { google_business: "failed", instagram: "failed", search_ai: "failed" };
  if (status === "partial") return { google_business: "unavailable", instagram: "unavailable", search_ai: "unavailable" };
  if (status === "done") return { google_business: "done", instagram: "done", search_ai: "done" };
  const stage = processingStage ?? status;
  switch (stage) {
    case "collecting_ig_gbp":
      return { google_business: "running", instagram: "running", search_ai: "pending" };
    case "collecting_aeo":
      return { google_business: "done", instagram: "done", search_ai: "running" };
    case "scoring":
    case "persisting":
      return { google_business: "done", instagram: "done", search_ai: "done" };
    default:
      return { google_business: "pending", instagram: "pending", search_ai: "pending" };
  }
}

/** `SCAN-` + the first six characters of the job id, upper-cased. */
export function scanReference(jobId: string): string {
  return `SCAN-${jobId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export function nextPollDelay(current: number): number {
  return Math.min(MAX_POLL_DELAY_MS, Math.round(current * POLL_BACKOFF_FACTOR));
}
