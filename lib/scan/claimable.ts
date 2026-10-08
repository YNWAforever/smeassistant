/**
 * The claim lease's own eligibility rule (`lib/scan/execution-store.ts::claimJob`):
 * a fresh queued job, or one stuck mid-collection for over 30 minutes with
 * fewer than 3 total attempts. Shared so a SELECT elsewhere (a scheduler's
 * reclaim query, added in a later task) can never drift from what the claim
 * UPDATE actually allows.
 */
const IN_FLIGHT_SQL = "status IN ('collecting','scoring','persisting')";
const STALE_ATTEMPT_SQL = "last_attempt_at IS NOT NULL AND last_attempt_at<now()-interval '30 minutes'";

export const CLAIMABLE_JOB_CONDITION_SQL = `(status='queued' OR (${IN_FLIGHT_SQL} AND attempt_count<3 AND ${STALE_ATTEMPT_SQL}))`;

/**
 * P3.5b: a stale in-flight job the lease will never claim again, because it
 * has used its three attempts. It is built from the same fragments as the
 * claimable rule, so a stale in-flight job is exactly one of the two: the cron
 * reclaim picks up the claimable ones, and the operator queue, the release
 * control and the auto-close sweep act on these.
 */
export const DEAD_LETTERED_JOB_CONDITION_SQL = `(${IN_FLIGHT_SQL} AND attempt_count>=3 AND ${STALE_ATTEMPT_SQL})`;

/**
 * F-13: the rescan of a location that is still under way -- queued or in
 * flight, not dead-lettered, and younger than the lease window. A second
 * owner press (or a retry after a lost response) reuses it instead of queueing
 * and paying for another scan. Past the window a job is finished, reclaimable
 * by the lease or dead-lettered, so a new request queues afresh.
 * $1 workspace_id, $2 location_id.
 */
export const LOCATION_LIVE_JOB_SQL = `SELECT id FROM audit_jobs
 WHERE workspace_id=$1 AND location_id=$2 AND (status='queued' OR ${IN_FLIGHT_SQL})
   AND NOT ${DEAD_LETTERED_JOB_CONDITION_SQL} AND created_at > now()-interval '30 minutes'
 ORDER BY created_at DESC, id DESC LIMIT 1`;
