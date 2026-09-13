/**
 * The claim lease's own eligibility rule (`lib/scan/execution-store.ts::claimJob`):
 * a fresh queued job, or one stuck mid-collection for over 30 minutes with
 * fewer than 3 total attempts. Shared so a SELECT elsewhere (a scheduler's
 * reclaim query, added in a later task) can never drift from what the claim
 * UPDATE actually allows.
 */
export const CLAIMABLE_JOB_CONDITION_SQL =
  "(status='queued' OR (status IN ('collecting','scoring','persisting') AND attempt_count<3 AND last_attempt_at IS NOT NULL AND last_attempt_at<now()-interval '30 minutes'))";
