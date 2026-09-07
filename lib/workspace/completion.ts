import "server-only";
import type { Pool } from "pg";
import { postProcessWorkspaceScan } from "./post-process";
import { completionTransaction } from "./completion-transaction";
export type CompletionResult = {
  status: "completed" | "busy" | "skipped" | "retry";
};
type Database = Pick<Pool, "query" | "connect">;
/** Claims are short transactions. Effects and successful finish commit together; recovery reads persisted evidence only. */
export async function completeWorkspaceScan(
  db: Database,
  jobId: string,
  process = postProcessWorkspaceScan,
): Promise<CompletionResult> {
  let claim: { status: string; token?: string } | undefined;
  try {
    claim = (
      await db.query("SELECT claim_workspace_completion($1) AS claim", [jobId])
    ).rows[0]?.claim;
  } catch {
    throw new Error("completion_claim_failed");
  }
  if (!claim) throw new Error("completion_claim_failed");
  if (
    claim.status === "completed" ||
    claim.status === "busy" ||
    claim.status === "skipped"
  )
    return { status: claim.status };
  if (claim.status !== "claimed" || typeof claim.token !== "string")
    throw new Error("completion_claim_invalid");
  const token = claim.token;
  try {
    await completionTransaction(db, jobId, token, async (client) => {
      const outcome = await process(client, jobId);
      if (!outcome.ran || outcome.error !== null)
        throw new Error("workspace_post_process_failed");
      const result = await client.query(
        "SELECT finish_workspace_completion($1,$2,true,NULL) AS finished",
        [jobId, token],
      );
      if (result.rows[0]?.finished !== true)
        throw new Error("completion_lease_lost");
    });
    return { status: "completed" };
  } catch {
    // Rollback has completed. A stale token cannot acknowledge another runner's lease.
    try {
      await db.query(
        "SELECT finish_workspace_completion($1,$2,false,$3) AS finished",
        [jobId, token, "workspace_post_process_failed"],
      );
    } catch {
      /* retained scheduler retries after lease expiry */
    }
    return { status: "retry" };
  }
}
/** Invoked by the one retained authorized scheduler, never collectors. */
export async function reconcileWorkspaceScans(
  db: Database,
  complete = completeWorkspaceScan,
): Promise<CompletionResult[]> {
  let rows: Array<{ job_id: string }>;
  try {
    rows = (
      await db.query("SELECT * FROM pending_workspace_completions($1)", [5])
    ).rows;
  } catch {
    throw new Error("completion_inventory_failed");
  }
  const results: CompletionResult[] = [];
  for (const row of rows.slice(0, 5)) {
    try {
      results.push(await complete(db, row.job_id));
    } catch {
      results.push({ status: "retry" });
    }
  }
  return results;
}
