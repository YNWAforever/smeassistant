/**
 * One turn per conversation, enforced server-side (design §6 "Concurrency").
 *
 * A Postgres advisory lock keyed by the conversation id. The lock lives on one
 * dedicated pooled client for the whole turn, not on a request-scoped
 * transaction: the turn performs several queries (conversation read, message
 * reads, classification, provider call, message append) and a transaction held
 * open across a model call would pin a connection for tens of seconds.
 *
 * `pg_try_advisory_lock` is non-blocking: a second concurrent turn gets
 * `null` and the caller answers `409 conversation_busy`. The release function
 * is idempotent so a stream cancel and the orchestrator's `finally` can both
 * call it without unlocking someone else's turn.
 */
export const STUDIO_TURN_LOCK_NAMESPACE = 1_398_031_684; // "STUD" as int4

export interface StudioLockClient {
  query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  release: () => void;
}

export interface StudioLockPool {
  connect: () => Promise<StudioLockClient>;
}

export interface StudioTurnLockDeps {
  /** Injected in tests; production resolves the application pool lazily. */
  pool?: StudioLockPool;
}

export type StudioTurnRelease = () => Promise<void>;

async function defaultPool(): Promise<StudioLockPool> {
  // Imported lazily so a unit test with an injected pool never opens one.
  const { getPool } = await import("@/lib/db/client");
  const pool = getPool();
  return { connect: () => pool.connect() };
}

/**
 * Acquire the conversation's turn lock. Resolves the release function when the
 * turn may proceed, `null` when another turn already holds it. A connection or
 * query failure throws: the caller maps it to `503 unavailable`, never to
 * "busy", because a database outage must not look like a concurrent turn.
 */
export async function acquireStudioTurnLock(
  conversationId: string,
  deps: StudioTurnLockDeps = {},
): Promise<StudioTurnRelease | null> {
  const pool = deps.pool ?? (await defaultPool());
  const client = await pool.connect();
  let released = false;
  let locked = false;
  const release = async (): Promise<void> => {
    if (released) return;
    released = true;
    try {
      if (locked) {
        await client.query("SELECT pg_advisory_unlock($1::int, hashtext($2)::int) AS released", [STUDIO_TURN_LOCK_NAMESPACE, conversationId]);
      }
    } catch {
      // The connection is about to be discarded; an unlock failure is logged by
      // the pool when the session ends. Never mask the turn's own outcome.
    } finally {
      client.release();
    }
  };

  try {
    const result = await client.query("SELECT pg_try_advisory_lock($1::int, hashtext($2)::int) AS locked", [STUDIO_TURN_LOCK_NAMESPACE, conversationId]);
    locked = result.rows[0]?.locked === true;
  } catch (error) {
    await release();
    throw error;
  }
  if (!locked) {
    await release();
    return null;
  }
  return release;
}
