import "server-only";
import type { Pool } from "pg";
import type { MailSendResult, MailSendStatus } from "./transport";

export interface MailAttempt {
  dedupeKey: string;
  status: MailSendStatus;
  providerMessageId: string | null;
  error: string | null;
  createdAt: string;
}

export interface RecordMailAttemptInput {
  dedupeKey: string;
  workspaceId: string | null;
  result: MailSendResult;
  /** Pass-through for a future caller's own domain row (e.g. a workspace_member id). Defaults to no specific entity. */
  entityType?: string;
  entityId?: string | null;
}

export interface RecordMailAttemptOutcome {
  /** False when a prior attempt for this dedupeKey already exists (a dedupe hit, not an error). */
  recorded: boolean;
  existing: MailAttempt | null;
}

function idempotencyKeyFor(dedupeKey: string): string {
  return `mail:${dedupeKey}`;
}

function toAttempt(row: { payload: Record<string, unknown> | null; created_at: string }, dedupeKey: string): MailAttempt {
  const payload = row.payload ?? {};
  return {
    dedupeKey,
    status: (payload.status as MailSendStatus | undefined) ?? "failed",
    providerMessageId: (payload.provider_message_id as string | null | undefined) ?? null,
    error: (payload.error as string | null | undefined) ?? null,
    createdAt: row.created_at,
  };
}

/**
 * Reads back a previously recorded attempt for this dedupe key, if any.
 * Phase 2 item 26's "retry/dedupe ledger" rides on audit_events rather than
 * a new table -- a schema change here would fail db:verify's frozen catalog
 * (scripts/neon/catalog.ts), and audit_events already has an unused unique
 * idempotency_key index built for exactly this kind of exactly-once record.
 */
export async function findMailAttempt(db: Pick<Pool, "query">, dedupeKey: string): Promise<MailAttempt | null> {
  const { rows } = await db.query<{ payload: Record<string, unknown> | null; created_at: string }>(
    `SELECT payload, created_at::text FROM audit_events WHERE idempotency_key = $1 LIMIT 1`,
    [idempotencyKeyFor(dedupeKey)],
  );
  const row = rows[0];
  return row ? toAttempt(row, dedupeKey) : null;
}

/**
 * Records a mail-send outcome exactly once per dedupe key. A second call
 * with the same dedupeKey is a no-op -- `recorded` is false and `existing`
 * carries what the first call actually recorded -- so a future caller (a
 * retry) can see whether it needs to send at all before calling the
 * transport again, rather than depending on this insert to fail loudly.
 */
export async function recordMailAttempt(
  db: Pick<Pool, "query">,
  input: RecordMailAttemptInput,
): Promise<RecordMailAttemptOutcome> {
  const idempotencyKey = idempotencyKeyFor(input.dedupeKey);
  const payload = {
    status: input.result.status,
    provider_message_id: input.result.providerMessageId ?? null,
    error: input.result.error ?? null,
  };
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO audit_events(idempotency_key,workspace_id,location_id,actor_type,actor_id,event,entity_type,entity_id,payload)
     VALUES($1,$2,NULL,'system',NULL,'mail.attempted',$3,$4,$5)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [idempotencyKey, input.workspaceId, input.entityType ?? "mail_attempt", input.entityId ?? null, JSON.stringify(payload)],
  );
  if (rows.length > 0) return { recorded: true, existing: null };
  return { recorded: false, existing: await findMailAttempt(db, input.dedupeKey) };
}
