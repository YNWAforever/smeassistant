import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { postProcessWorkspaceScan } from "./post-process";
import { completionClient } from "./completion-client";

export type CompletionResult = { status: "completed" | "busy" | "skipped" | "retry" };
type Processor = typeof postProcessWorkspaceScan;

/** Recover workspace effects from persisted evidence; never invoke scan collectors. */
export async function completeWorkspaceScan(db: SupabaseClient, jobId: string, process: Processor = postProcessWorkspaceScan, scopedClient = completionClient): Promise<CompletionResult> {
  const { data: claim, error } = await db.rpc("claim_workspace_completion", { p_job_id: jobId });
  if (error || !claim) throw new Error("completion_claim_failed");
  if (["completed", "busy", "skipped"].includes(claim.status)) return { status: claim.status };
  if (claim.status !== "claimed" || typeof claim.token !== "string") throw new Error("completion_claim_invalid");
  let succeeded = false;
  try {
    const outcome = await process(scopedClient(jobId, claim.token), jobId);
    succeeded = outcome.ran && outcome.error === null;
  } catch {
    // Persist only a bounded category; raw errors can contain merchant/provider data.
  }
  const finished = await db.rpc("finish_workspace_completion", {
    p_job_id: jobId, p_token: claim.token, p_succeeded: succeeded,
    p_error: succeeded ? null : "workspace_post_process_failed",
  });
  if (finished.error || finished.data !== true) return { status: "retry" };
  return { status: succeeded ? "completed" : "retry" };
}

/** Called by the retained scheduler's authorized forwarding phase, not a new cron. */
export async function reconcileWorkspaceScans(db: SupabaseClient, complete = completeWorkspaceScan): Promise<CompletionResult[]> {
  const { data, error } = await db.rpc("pending_workspace_completions", { p_limit: 5 });
  if (error || !Array.isArray(data)) throw new Error("completion_inventory_failed");
  const results: CompletionResult[] = [];
  for (const row of data.slice(0, 5)) {
    try { results.push(await complete(db, row.job_id)); }
    catch { results.push({ status: "retry" }); }
  }
  return results;
}
