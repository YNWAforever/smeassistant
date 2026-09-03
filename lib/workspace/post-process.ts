import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveActionsForSnapshot } from "@/lib/workspace/actions";
import { buildSnapshot } from "@/lib/workspace/snapshots";

/**
 * Workspace post-processing after a scan persists (CLAUDE.md Phase 3 items 1-2):
 * build the snapshot, then derive/refresh actions from it. Runs only for jobs
 * attached to a workspace; a public scan leaves no workspace rows behind.
 *
 * Best-effort by contract: the scan result is already persisted and reported
 * to the merchant, so a failure here is logged and never surfaces as a failed
 * scan. The claim route re-runs the same two steps, which is also the retry
 * path when this one fails.
 */
export interface PostProcessOutcome {
  ran: boolean;
  snapshotId: string | null;
  error: string | null;
}

export async function postProcessWorkspaceScan(db: SupabaseClient, jobId: string): Promise<PostProcessOutcome> {
  try {
    const { data: job, error } = await db.from("audit_jobs").select("id, workspace_id, status").eq("id", jobId).maybeSingle<{
      id: string;
      workspace_id: string | null;
      status: string;
    }>();
    if (error || !job || !job.workspace_id) return { ran: false, snapshotId: null, error: null };
    if (job.status !== "done" && job.status !== "partial") return { ran: false, snapshotId: null, error: null };

    const snapshot = await buildSnapshot(db, jobId);
    await deriveActionsForSnapshot(db, snapshot.id);
    return { ran: true, snapshotId: snapshot.id, error: null };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown";
    console.error("[workspace/post-process] failed", { category: "workspace_post_process_failed", jobId, message });
    return { ran: true, snapshotId: null, error: message };
  }
}
