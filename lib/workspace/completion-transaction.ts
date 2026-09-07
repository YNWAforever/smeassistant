import "server-only";
import type { Pool, PoolClient } from "pg";
import { withTransaction } from "@/lib/db/transaction";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Caller must supply both identities. Workspace then ledger matches the database trigger lock order. */
export async function completionTransaction<T>(
  pool: Pick<Pool, "connect">,
  jobId: string,
  token: string,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!uuid.test(jobId) || !uuid.test(token))
    throw new Error("completion_context_missing");
  return withTransaction(async (client) => {
    await client.query(
      "SELECT w.id FROM workspaces w JOIN audit_jobs j ON j.workspace_id=w.id WHERE j.id=$1 FOR UPDATE OF w",
      [jobId],
    );
    const lease = await client.query(
      `SELECT c.job_id FROM workspace_scan_completions c JOIN audit_jobs j ON j.id=c.job_id
   WHERE c.job_id=$1 AND c.lease_token=$2 AND c.state='running' AND c.lease_until>clock_timestamp()
   AND c.workspace_id=j.workspace_id AND j.status IN ('done','partial','failed') FOR UPDATE OF c`,
      [jobId, token],
    );
    if (!lease.rows.length) throw new Error("completion_lease_lost");
    await client.query(
      "SELECT set_config('app.completion_job',$1,true), set_config('app.completion_token',$2,true)",
      [jobId, token],
    );
    return run(client);
  }, pool);
}
