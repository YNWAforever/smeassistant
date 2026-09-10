/**
 * Helpers behind the scanning page: stage → progress, stage → collector cards,
 * poll backoff, the bounded polling budget and the scan reference. Shapes follow
 * upstream's GET /api/scan/status response and ScanStage vocabulary
 * (CLAUDE.md §3.2.2).
 *
 * Everything above the "Bounded polling" section is pure. The poll-record
 * section persists a small per-job record, but the storage is always passed in
 * as an argument -- nothing here touches `window` itself -- so it stays unit
 * testable and safe to import during server rendering.
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
 * stalled     — we stopped asking; this collector's real state is unknown
 *
 * `stalled` is a client display overlay applied by stallCollectorPhases, never
 * something collectorPhases() derives from a server response.
 */
export type CollectorPhase = "pending" | "running" | "done" | "unavailable" | "failed" | "stalled";

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

/**
 * Backs off geometrically, then drops to a much slower cadence once the scan has
 * been running long enough that a fast poll buys nothing. The default
 * `elapsedMs` keeps the original ladder, which tests/funnel-scan.test.ts pins.
 */
export function nextPollDelay(current: number, elapsedMs = 0): number {
  const cap = elapsedMs >= SLOW_POLL_AFTER_MS ? SLOW_POLL_DELAY_MS : MAX_POLL_DELAY_MS;
  return Math.min(cap, Math.round(current * POLL_BACKOFF_FACTOR));
}

// ---------------------------------------------------------------------------
// Bounded polling
//
// The page used to poll until the status turned terminal, with no bound at all:
// a scan that never reported a terminal state left the tab requesting forever,
// and RATE_LIMITS.scan_status (120/hour per jobId x IP) meant the 8s loop
// started 429ing at roughly sixteen minutes and then spun on errors.
//
// The budget below stops asking after 15 minutes or 50 attempts, whichever comes
// first, and the resulting state says exactly that -- we stopped asking -- never
// that the scan failed. A scan really may still be running server-side.
// ---------------------------------------------------------------------------

/** After this much elapsed time the loop drops from the 8s cap to SLOW_POLL_DELAY_MS. */
export const SLOW_POLL_AFTER_MS = 90_000;
export const SLOW_POLL_DELAY_MS = 30_000;
export const MAX_POLL_DURATION_MS = 900_000;
/** Backstop only; the duration budget binds first under the schedule above. */
export const MAX_POLL_ATTEMPTS = 50;
export const MAX_CONSECUTIVE_POLL_ERRORS = 5;
/** Minimum gap before a visibilitychange catch-up is allowed to spend a request. */
export const CATCH_UP_MIN_INTERVAL_MS = 30_000;
/** scan_process is 20/hour per jobId x IP -- a rapid refresh must not burn it. */
export const PROCESS_POST_COOLDOWN_MS = 60_000;
export const POLL_RECORD_MAX_AGE_MS = 86_400_000;
export const CLOCK_SKEW_TOLERANCE_MS = 60_000;
/**
 * Mirrors the `interval '30 minutes'` literal in lib/scan/execution-store.ts's
 * claimJob UPDATE. The stalled copy quotes this number, so
 * lib/funnel/scan-progress.test.ts asserts the two agree.
 */
export const SCAN_RECLAIM_WINDOW_MINUTES = 30;

export type StalledReason = "timeout" | "rateLimited" | "unreachable" | "missing";
export type ScanViewState = "running" | "ready" | "failed" | "stalled";

export function isPollBudgetExhausted(attempt: number, elapsedMs: number): boolean {
  return attempt >= MAX_POLL_ATTEMPTS || elapsedMs >= MAX_POLL_DURATION_MS;
}

export interface PollLoopState {
  attempt: number;
  consecutiveErrors: number;
  delayMs: number;
  stalledReason: StalledReason | null;
  terminal: boolean;
}

export function initialPollLoopState(): PollLoopState {
  return { attempt: 0, consecutiveErrors: 0, delayMs: INITIAL_POLL_DELAY_MS, stalledReason: null, terminal: false };
}

export type PollOutcome =
  | { kind: "status"; status: string }
  | { kind: "http"; httpStatus: number }
  | { kind: "network" };

/**
 * The testable core of the bound. The component owns no loop rules of its own:
 * it feeds one outcome in and either reschedules, stops, or shows the stalled
 * card, purely on what comes back.
 *
 * A terminal status always wins, even from an already-stalled state, so the
 * visibility catch-up can rescue a scan that finished while the tab was hidden.
 * A healthy non-terminal status clears any stall other than "missing", so a
 * catch-up that gets a good answer resumes the loop rather than leaving the card
 * contradicting the progress bar.
 */
export function advancePollLoop(state: PollLoopState, outcome: PollOutcome, elapsedMs: number): PollLoopState {
  const attempt = state.attempt + 1;
  if (outcome.kind === "status") {
    if (isTerminalStatus(outcome.status)) {
      return { ...state, attempt, consecutiveErrors: 0, stalledReason: null, terminal: true };
    }
    // "missing" is permanent for this jobId, so a later 200 cannot un-say it.
    const cleared = state.stalledReason === "missing" ? "missing" : null;
    const stalledReason: StalledReason | null = cleared ?? (isPollBudgetExhausted(attempt, elapsedMs) ? "timeout" : null);
    return { attempt, consecutiveErrors: 0, delayMs: nextPollDelay(state.delayMs, elapsedMs), stalledReason, terminal: false };
  }
  if (outcome.kind === "http") {
    // 404 (no such job) and 400 (not a UUID) are both permanent for this jobId:
    // retrying can only ever produce the same answer.
    if (outcome.httpStatus === 404 || outcome.httpStatus === 400) {
      return { ...state, attempt, stalledReason: "missing", terminal: false };
    }
    // Continuing would only burn more of an already-exhausted bucket.
    if (outcome.httpStatus === 429) {
      return { ...state, attempt, stalledReason: "rateLimited", terminal: false };
    }
  }
  const consecutiveErrors = state.consecutiveErrors + 1;
  if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
    return { ...state, attempt, consecutiveErrors, stalledReason: "unreachable", terminal: false };
  }
  return {
    attempt,
    consecutiveErrors,
    delayMs: nextPollDelay(state.delayMs, elapsedMs),
    stalledReason: isPollBudgetExhausted(attempt, elapsedMs) ? "timeout" : state.stalledReason,
    terminal: false,
  };
}

/**
 * Whether a visibilitychange catch-up may spend one request. "missing" never
 * becomes found, and "rateLimited" means the bucket is known to be exhausted.
 */
export function shouldCatchUp(state: PollLoopState): boolean {
  return !state.terminal && state.stalledReason !== "missing" && state.stalledReason !== "rateLimited";
}

/** Terminal truth always outranks a stalled verdict. */
export function scanViewState(input: { status: string; stalledReason: StalledReason | null }): ScanViewState {
  if (input.status === "failed") return "failed";
  if (isTerminalStatus(input.status)) return "ready";
  if (input.stalledReason) return "stalled";
  return "running";
}

/**
 * Overlays "stalled" on the collectors whose state we can no longer observe.
 * Anything already resolved keeps its real outcome -- we only stopped asking
 * about what was still in flight.
 */
export function stallCollectorPhases(phases: Record<CollectorKey, CollectorPhase>): Record<CollectorKey, CollectorPhase> {
  const overlay = (phase: CollectorPhase): CollectorPhase => (phase === "pending" || phase === "running" ? "stalled" : phase);
  return {
    google_business: overlay(phases.google_business),
    instagram: overlay(phases.instagram),
    search_ai: overlay(phases.search_ai),
  };
}

/**
 * Per-job polling record, persisted so a refresh resumes the remaining budget
 * instead of buying a fresh fifteen minutes.
 *
 * `startedAt` is never reset -- it is the honest elapsed clock the page shows.
 * `budgetStartedAt` is separately resettable, so "Check again" re-arms polling
 * without rewriting how long the merchant has actually been waiting.
 *
 * Multi-tab budget sharing is explicitly out of scope: two tabs on the same scan
 * each keep their own in-memory copy and last-writer-wins on the key. The blast
 * radius is bounded by the server (claimJob is a single atomic UPDATE, and
 * scan_process is 20/hour), so the cost is at most a duplicated request, never a
 * duplicated job.
 */
export interface ScanPollRecord {
  startedAt: number;
  budgetStartedAt: number;
  lastProcessAt: number;
  lastPollAt: number;
}

export const POLL_RECORD_PREFIX = "sme.scan.poll.";

export function pollRecordKey(jobId: string): string {
  return `${POLL_RECORD_PREFIX}${jobId}`;
}

export type PollRecordStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function freshRecord(now: number): ScanPollRecord {
  return { startedAt: now, budgetStartedAt: now, lastProcessAt: 0, lastPollAt: 0 };
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Always returns a usable record. Storage can be absent (private mode) or throw
 * on access, the value can be missing or corrupt, and the clock can have moved
 * backwards -- every one of those falls back to a fresh record rather than
 * throwing into a render.
 *
 * A record whose last poll is older than the whole budget is re-armed: that is a
 * genuine return visit (the recovery link, a reopened tab tomorrow), not a rapid
 * refresh trying to buy more polling, and its own copy promises the scan can be
 * picked up here. `startedAt` survives that re-arming.
 */
export function readPollRecord(jobId: string, storage: PollRecordStorage | null, now: number): ScanPollRecord {
  const fallback = () => {
    const record = freshRecord(now);
    writePollRecord(jobId, storage, record);
    return record;
  };
  if (!storage) return freshRecord(now);
  try {
    const raw = storage.getItem(pollRecordKey(jobId));
    if (!raw) return fallback();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return fallback();
    const { startedAt, budgetStartedAt, lastProcessAt, lastPollAt } = parsed as Record<string, unknown>;
    if (!finitePositive(startedAt) || !finitePositive(budgetStartedAt)) return fallback();
    if (startedAt > now + CLOCK_SKEW_TOLERANCE_MS) return fallback();
    if (now - startedAt > POLL_RECORD_MAX_AGE_MS) return fallback();
    const record: ScanPollRecord = {
      startedAt,
      budgetStartedAt,
      lastProcessAt: finitePositive(lastProcessAt) ? lastProcessAt : 0,
      lastPollAt: finitePositive(lastPollAt) ? lastPollAt : 0,
    };
    if (record.lastPollAt && now - record.lastPollAt > MAX_POLL_DURATION_MS) {
      const rearmed = { ...record, budgetStartedAt: now };
      writePollRecord(jobId, storage, rearmed);
      return rearmed;
    }
    return record;
  } catch {
    return freshRecord(now);
  }
}

export function writePollRecord(jobId: string, storage: PollRecordStorage | null, record: ScanPollRecord): void {
  if (!storage) return;
  try {
    storage.setItem(pollRecordKey(jobId), JSON.stringify(record));
  } catch {
    // Private mode or blocked site data: the budget degrades to in-memory only.
  }
}

export function clearPollRecord(jobId: string, storage: PollRecordStorage | null): void {
  if (!storage) return;
  try {
    storage.removeItem(pollRecordKey(jobId));
  } catch {
    // Nothing to recover: the record is a convenience, never a source of truth.
  }
}

export function formatElapsed(totalSeconds: number): { minutes: number; seconds: number } {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return { minutes: Math.floor(safe / 60), seconds: safe % 60 };
}
