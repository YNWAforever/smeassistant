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
 * What the key does and does not do: the session is part of the unique index,
 * so a repeated write is idempotent only when it carries the SAME session. A
 * write for the same job from a different session is a different identity and
 * is not deduplicated by the key.
 *
 * - scan_completed: what actually keeps a job to one row is that a committed
 *   terminal status ends the job's claimability, so no later process can reach
 *   persist() or fail() for it again (fail() and failQueued() additionally
 *   write only when their status guard matched). The fixed key covers the
 *   narrower case of the same session writing twice for the same job.
 * - scan_started: the job id is minted inside the same transaction that
 *   writes the event, so a retry creates a new job and the conflict cannot
 *   occur on that path. The key only guards against a future writer
 *   recording scan_started a second time for the same job and session.
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

/**
 * Writes a scan event inside a SAVEPOINT on the caller's transaction, so a
 * failure to record analytics can never cost the scan it describes.
 *
 * A try/catch alone would not be enough: once a statement fails, PostgreSQL
 * aborts the whole transaction and refuses every later statement, COMMIT
 * included. Rolling back to the savepoint is what lets the caller's own
 * writes commit. The lost event is not silent: it is logged here, and it
 * shows up as a counted gap in the value report's reconciliation.
 *
 * If SAVEPOINT or ROLLBACK TO SAVEPOINT itself fails, that is a
 * connection-level failure of the same class as COMMIT failing, and it
 * propagates to the caller's transaction.
 *
 * Returns whether the event was written.
 */
export async function writeScanEventSafely(
  client: Pick<PoolClient, "query">,
  write: { jobId: string; anonymousSessionId: string; event: ScanEvent; dedupeKey: string },
): Promise<boolean> {
  await client.query("SAVEPOINT scan_event");
  try {
    await insertScanEvent(client, write);
    await client.query("RELEASE SAVEPOINT scan_event");
    return true;
  } catch {
    await client.query("ROLLBACK TO SAVEPOINT scan_event");
    console.error("[analytics] event_record_failed", { category: "event_write_failed", event: write.event.name });
    return false;
  }
}
