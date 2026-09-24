import "server-only";

import type { Pool, PoolClient } from "pg";

import { getPool } from "./client";

export async function withTransaction<T>(run: (client: PoolClient) => Promise<T>, pool: Pick<Pool, "connect"> = getPool()): Promise<T> {
  const client = await pool.connect();
  let destroyClient = false;
  try {
    await client.query("BEGIN");
    const value = await run(client);
    const committed = await client.query("COMMIT");
    // COMMIT on an aborted transaction does not raise: it returns the tag
    // ROLLBACK, and node-pg resolves. Treat that as the failure it is, so a
    // caught statement error can never silently discard the caller's writes.
    if (committed?.command === "ROLLBACK") throw new Error("transaction_rolled_back");
    return value;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      destroyClient = true;
    }
    throw error;
  } finally {
    if (destroyClient) {
      client.release(true);
    } else {
      client.release();
    }
  }
}
/** Run completion writes on one client with context scoped to this transaction only. */
export async function withCompletionContext<T>(jobId: string, token: string, run: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTransaction(async client => {
    await client.query("SELECT set_config('app.completion_job',$1,true), set_config('app.completion_token',$2,true)", [jobId, token]);
    return run(client);
  });
}
