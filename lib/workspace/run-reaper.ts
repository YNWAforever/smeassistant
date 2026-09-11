import { actionRunReaperRepository } from "@/lib/repositories/action-run-reaper";

/**
 * Policy and best-effort orchestration for reaping stranded `action_runs`.
 *
 * Deliberately a tiny module: the read path in lib/workspace/queries-pages.ts
 * calls it during an RSC render, and importing lib/workspace/runs.ts there would
 * drag the whole agent/LLM graph into every action-detail render.
 *
 * Threshold. ROUTE_MAX_DURATION_MS (lib/workspace/runs.ts) is 60_000 and matches
 * `maxDuration = 60` on app/api/actions/[actionId]/run/route.ts — the platform's
 * hard kill. Three minutes is 3x that ceiling, so a run this old provably has no
 * live handler behind it, while the owner's Generate button is dead for three
 * minutes rather than forever. lib/workspace/run-reaper.test.ts pins
 * `RUN_STALE_AFTER_MS > ROUTE_MAX_DURATION_MS * 2` so nobody can shorten it into
 * the window where the platform could still be executing the handler. Contrast
 * with claim_audit_job's 30-minute lease: a scan is minutes long, an inline
 * agent run is seconds.
 *
 * Recovery is owner-triggered discovery, not self-healing. The only trigger is
 * getAction, so a stranded run is cleared when the owner opens that action's
 * detail page. Two honest limits follow:
 *  - The ACTIONS LIST page is not reaped (that would make every list render a
 *    multi-row write), so a stranded run keeps showing the "Generating" chip
 *    until the owner opens the action. lib/workspace/queries-pages.test.ts pins
 *    this so it stays a decision rather than an oversight.
 *  - When the action's `action_state` is 'needs_input', displayPhaseKey
 *    (lib/workspace/overview.ts:90) short-circuits before it ever consults
 *    runState, so the list page shows no anomaly at all. The owner's only signal
 *    there is the dead Generate button on the detail page — which is also the
 *    trigger that fixes it.
 * Rows stranded by earlier deploys are cleared the same way. There is no bulk
 * backfill by design: no cron and no second scheduler is permitted here, and a
 * one-shot sweep would be a separately authorized action. Every stranded row is
 * reachable through its own detail page, so none is permanently stuck.
 */
export const RUN_STALE_AFTER_MS = 3 * 60 * 1000;

interface ReapRepository {
  reapStale(workspaceId: string, actionIds: string[], staleAfterMs: number): Promise<string[]>;
}

/**
 * Best-effort exactly like recordNeonEvent in lib/workspace/audit.ts: a
 * reconciliation write must never turn an authorized read into a 503.
 */
export async function reapStrandedRuns(
  workspaceId: string,
  actionIds: string[],
  opts: { repository?: ReapRepository; staleAfterMs?: number } = {},
): Promise<string[]> {
  if (!actionIds.length) return [];
  try {
    const repository = opts.repository ?? actionRunReaperRepository();
    return await repository.reapStale(workspaceId, actionIds, opts.staleAfterMs ?? RUN_STALE_AFTER_MS);
  } catch {
    console.error("[workspace/run-reaper] stale runs not reaped", { category: "action_run_reap_failed" });
    return [];
  }
}
