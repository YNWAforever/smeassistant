/**
 * How old a queued/running `action_runs` row must be before it is treated as
 * stranded. The rationale and the pinned bound against the route's hard kill
 * live with the reaper (lib/workspace/run-reaper.ts), which re-exports this.
 *
 * Kept dependency-free on purpose: lib/repositories/artifacts.ts reads it for
 * the F-14 in-flight check, and importing the reaper there would pull its
 * repository and audit modules into every artifact import.
 */
export const RUN_STALE_AFTER_MS = 3 * 60 * 1000;
