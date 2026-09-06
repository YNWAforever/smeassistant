import "server-only";

import type { PoolClient } from "pg";

import { getPool } from "./client";

export async function withTransaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  let destroyClient = false;
  try {
    await client.query("BEGIN");
    const value = await run(client);
    await client.query("COMMIT");
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
