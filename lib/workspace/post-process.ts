import type { SupabaseClient } from "@supabase/supabase-js";
import { localized } from "@/lib/domain";
import { deriveActionsForSnapshot } from "@/lib/workspace/actions";
import { recordMeasurements } from "@/lib/workspace/measurements";
import { notifyWorkspace } from "@/lib/workspace/notify";
import { buildSnapshot, loadDiffForHeadJob } from "@/lib/workspace/snapshots";

/**
 * Workspace post-processing after a scan persists (CLAUDE.md Phase 3 items 1-2,
 * Phase 6 items 2 and 4): build the snapshot, derive/refresh actions from it,
 * record action measurements when the diff is comparable, then notify the
 * team in-app. A failed workspace scan gets the notification only. Runs only
 * for jobs attached to a workspace; a public scan leaves no workspace rows
 * behind.
 *
 * Best-effort by contract: the scan result is already persisted and reported
 * to the merchant, so a failure here is logged and never surfaces as a failed
 * scan. The claim route re-runs the snapshot + actions steps, which is also
 * the retry path when this one fails.
 */
export interface PostProcessOutcome {
  ran: boolean;
  snapshotId: string | null;
  error: string | null;
}

interface PostProcessJob {
  id: string;
  workspace_id: string | null;
  location_id: string | null;
  status: string;
  business_name: string | null;
}

async function workspaceHref(db: SupabaseClient, workspaceId: string, locationId: string | null): Promise<string | null> {
  try {
    const { data } = await db.from("workspaces").select("slug").eq("id", workspaceId).maybeSingle<{ slug: string | null }>();
    if (!data?.slug) return null;
    let query = "";
    if (locationId) {
      const { data: location } = await db.from("locations").select("slug").eq("id", locationId).maybeSingle<{ slug: string | null }>();
      if (location?.slug) query = `?location=${encodeURIComponent(location.slug)}`;
    }
    return `/owner/${data.slug}${query}`;
  } catch {
    return null;
  }
}

export async function postProcessWorkspaceScan(db: SupabaseClient, jobId: string): Promise<PostProcessOutcome> {
  try {
    const { data: job, error } = await db
      .from("audit_jobs")
      .select("id, workspace_id, location_id, status, business_name")
      .eq("id", jobId)
      .maybeSingle<PostProcessJob>();
    if (error || !job || !job.workspace_id) return { ran: false, snapshotId: null, error: null };
    const name = job.business_name?.trim() || "";

    if (job.status === "failed") {
      await notifyWorkspace(db, {
        workspaceId: job.workspace_id,
        kind: "scan.failed",
        title: localized(name ? `Scan failed for ${name}` : "Scan failed", name ? `${name} 掃描失敗` : "掃描失敗"),
        body: localized("The scan could not finish. Try a rescan later or check the integrations page.", "掃描未能完成。請稍後重新掃描，或檢查整合頁面。"),
        href: await workspaceHref(db, job.workspace_id, job.location_id),
      });
      return { ran: true, snapshotId: null, error: null };
    }
    if (job.status !== "done" && job.status !== "partial") return { ran: false, snapshotId: null, error: null };

    const snapshot = await buildSnapshot(db, jobId);
    await deriveActionsForSnapshot(db, snapshot.id);

    // Measurements only when scan-engine wrote a comparable diff; a failure
    // here must not cost the merchant the completion notice.
    try {
      const diff = await loadDiffForHeadJob(db, jobId);
      if (diff?.comparable) await recordMeasurements(db, { headSnapshot: snapshot, diff });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "unknown";
      console.error("[workspace/post-process] measurements failed", { category: "workspace_measurements_failed", jobId, message });
    }

    await notifyWorkspace(db, {
      workspaceId: job.workspace_id,
      kind: "scan.completed",
      title: localized(name ? `Scan completed for ${name}` : "Scan completed", name ? `${name} 掃描完成` : "掃描完成"),
      body: job.status === "partial"
        ? localized("Some sources could not be read; the report shows what was measured.", "部分來源無法讀取；報告只顯示已量度的部分。")
        : localized("Your workspace has fresh evidence and refreshed actions.", "工作區已有最新證據及更新後的行動。"),
      href: await workspaceHref(db, job.workspace_id, job.location_id),
    });
    return { ran: true, snapshotId: snapshot.id, error: null };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown";
    console.error("[workspace/post-process] failed", { category: "workspace_post_process_failed", jobId, message });
    return { ran: true, snapshotId: null, error: message };
  }
}
