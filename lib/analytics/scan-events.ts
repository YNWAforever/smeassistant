import "server-only";
import type { PoolClient } from "pg";
import { parseScanEvent, type ScanEvent } from "@sme-scanner/scan-engine";

/**
 * Fixed dedupe keys. scan_events_dedupe_identity_unique_idx covers
 * (job_id, anonymous_session_id, event_name, dedupe_key) with no
 * NULLS NOT DISTINCT. scan_started and scan_completed used to be written with
 * a NULL key, which never conflicts, so ON CONFLICT DO NOTHING could not
 * deduplicate them. (complete_report_unlock already writes its own sha256
 * key; this is about the two scan events only.)
 *
 * - scan_completed: a retried persist() targets the same job, so the fixed
 *   key really does make the retried write idempotent.
 * - scan_started: the job id is minted inside the same transaction that
 *   writes the event, so a retry creates a new job and the conflict cannot
 *   occur on that path. The key only guards against a future writer
 *   recording scan_started a second time for the same job.
 */
export const SCAN_STARTED_DEDUPE_KEY = "started";
export const SCAN_TERMINAL_DEDUPE_KEY = "terminal";

export type ScanOutcome = "done" | "partial" | "failed";

/**
 * Built and validated by the engine's parseScanEvent BEFORE any transaction
 * opens. These events are now written inside the transaction that records the
 * fact they describe, so an invalid event must be rejected here: inside the
 * transaction the insert may then fail only the way any other statement could.
 */
export function scanStartedEvent(market: string, locale: string): ScanEvent {
  return parseScanEvent({ name: "scan_started", properties: { market, locale } });
}

export function scanCompletedEvent(outcome: ScanOutcome, coverage: number): ScanEvent {
  return parseScanEvent({ name: "scan_completed", properties: { outcome, coverage } });
}

/** What jobsRepository.insert needs to write scan_started beside the job. */
export interface ScanStartedWrite {
  anonymousSessionId: string;
  event: ScanEvent;
}

/**
 * The one statement that writes scan_events from this app. Takes the caller's
 * client so it joins the caller's transaction; it never opens a connection.
 */
export async function insertScanEvent(
  client: Pick<PoolClient, "query">,
  write: { jobId: string; anonymousSessionId: string; event: ScanEvent; dedupeKey: string },
): Promise<void> {
  await client.query(
    `INSERT INTO scan_events(job_id,anonymous_session_id,event_name,properties,dedupe_key)
     VALUES($1,$2,$3,$4::jsonb,$5)
     ON CONFLICT(job_id,anonymous_session_id,event_name,dedupe_key) DO NOTHING`,
    [write.jobId, write.anonymousSessionId, write.event.name, JSON.stringify(write.event.properties), write.dedupeKey],
  );
}
