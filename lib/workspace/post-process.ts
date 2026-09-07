import { measurementRepository } from "@/lib/repositories/measurements";
import { snapshotRepository } from "@/lib/repositories/snapshots";
import type { PoolClient } from "pg";
import { notificationRepository } from "@/lib/repositories/notifications";
import { localized } from "@/lib/domain";
import { actionDerivationRepository } from "@/lib/repositories/action-derivation";
import { recordMeasurements } from "@/lib/workspace/measurements";
import { notifyWithRepository } from "@/lib/workspace/notify";
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
 * scan. Errors stay visible in the outcome and logs; callers can repeat this
 * hook against the persisted terminal job without invoking collectors. Durable
 * reconciliation is owned by completion.ts and its ledger; this function runs
 * only database operations on the caller-owned transaction.
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

async function workspaceHref(db: PoolClient, workspaceId: string, locationId: string | null): Promise<string | null> {
  try {
    const data = (await db.query<{slug:string|null}>("SELECT slug FROM workspaces WHERE id=$1",[workspaceId])).rows[0];
    if (!data?.slug) return null;
    let query = "";
    if (locationId) {
      const location = (await db.query<{slug:string|null}>("SELECT slug FROM locations WHERE id=$1 AND workspace_id=$2",[locationId,workspaceId])).rows[0];
      if (location?.slug) query = `?location=${encodeURIComponent(location.slug)}`;
    }
    return `/owner/${data.slug}${query}`;
  } catch {
    return null;
  }
}

export async function postProcessWorkspaceScan(db: PoolClient, jobId: string): Promise<PostProcessOutcome> {
  let snapshotId: string | null = null;
  try {
    const job = (await db.query<PostProcessJob>("SELECT id,workspace_id,location_id,status,business_name FROM audit_jobs WHERE id=$1",[jobId])).rows[0];
    if (!job || !job.workspace_id) return { ran: false, snapshotId: null, error: null };
    const name = job.business_name?.trim() || "";

    if (job.status === "failed") {
      const notification = await notifyWithRepository(notificationRepository(db), {
        workspaceId: job.workspace_id,
        completionJobId: job.id,
        kind: "scan.failed",
        title: localized(name ? `Scan failed for ${name}` : "Scan failed", name ? `${name} 掃描失敗` : "掃描失敗"),
        body: localized("The scan could not finish. Try a rescan later or check the integrations page.", "掃描未能完成。請稍後重新掃描，或檢查整合頁面。"),
        href: await workspaceHref(db, job.workspace_id, job.location_id),
      });
      if (notification.error) throw new Error(notification.error);
      return { ran: true, snapshotId: null, error: null };
    }
    if (job.status !== "done" && job.status !== "partial") return { ran: false, snapshotId: null, error: null };

    const snapshot = await buildSnapshot(snapshotRepository(db), jobId, { persistedOnly: true });
    snapshotId = snapshot.id;
    await actionDerivationRepository(db).derive(snapshot.id);

    // A missing measurement is an incomplete workspace update, even though
    // the original scan remains valid. Do not announce completed workspace
    // refresh until required side effects succeed.
    const diff = await loadDiffForHeadJob(snapshotRepository(db), jobId);
    if (diff?.comparable) {
      const measurements = await recordMeasurements(measurementRepository(db), { headSnapshot: snapshot, diff });
      if (!measurements.comparable) throw new Error("measurement base snapshot not ready");
    }

    const notification = await notifyWithRepository(notificationRepository(db), {
      workspaceId: job.workspace_id,
      completionJobId: job.id,
      kind: "scan.completed",
      title: localized(name ? `Scan completed for ${name}` : "Scan completed", name ? `${name} 掃描完成` : "掃描完成"),
      body: job.status === "partial"
        ? localized("Some sources could not be read; the report shows what was measured.", "部分來源無法讀取；報告只顯示已量度的部分。")
        : localized("Your workspace has fresh evidence and refreshed actions.", "工作區已有最新證據及更新後的行動。"),
      href: await workspaceHref(db, job.workspace_id, job.location_id),
    });
    if (notification.error) throw new Error(notification.error);
    return { ran: true, snapshotId: snapshot.id, error: null };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown";
    console.error("[workspace/post-process] failed", { category: "workspace_post_process_failed", jobId, message });
    return { ran: true, snapshotId, error: message };
  }
}
