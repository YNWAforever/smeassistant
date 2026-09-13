import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getPool } from "@/lib/db/client";
import { authorizeCronRequest, cronUnauthorizedResponse } from "@/lib/security/cron-auth";
import { notifyDueSchedules } from "@/lib/scan/notify-due-schedules";
import { schedulerRepository } from "@/lib/repositories/scheduler";
import { reconcileWorkspaceScans } from "@/lib/workspace/completion";

export const maxDuration = 60;

const RECLAIM_BATCH_LIMIT = 20;

function logFailure(step: string, cause: unknown) {
  console.error(`[cron/dispatch] ${step} failed`, {
    category: "cron_dispatch_step_failed",
    step,
    message: cause instanceof Error ? cause.message : "unknown",
  });
}

/**
 * The one retained scheduler (design doc: docs/superpowers/specs/2026-09-13-scan-scheduler-trigger-design.md).
 * Every 5 minutes: notify due schedules (never auto-dispatch -- the owner
 * still clicks "Rescan now"), kick off reprocessing for abandoned scans, and
 * reconcile workspace-completion effects that never ran. Each concern is
 * isolated so one failing does not block the others.
 */
export async function POST(request: Request): Promise<Response> {
  if (!authorizeCronRequest(request)) return cronUnauthorizedResponse();

  let notified = { due: 0, notified: 0 };
  try {
    notified = await notifyDueSchedules(new Date().toISOString());
  } catch (cause) {
    logFailure("notify_due_schedules", cause);
  }

  let reclaimed = 0;
  try {
    const jobIds = await schedulerRepository().claimableJobIds(RECLAIM_BATCH_LIMIT);
    reclaimed = jobIds.length;
    const origin = process.env.APP_ORIGIN;
    if (origin) {
      for (const jobId of jobIds) {
        waitUntil(
          fetch(`${origin}/api/scan/process`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jobId }),
          }).catch((cause) => logFailure(`reclaim_dispatch:${jobId}`, cause)),
        );
      }
    }
  } catch (cause) {
    logFailure("reclaim_abandoned_scans", cause);
  }

  let reconciled = 0;
  try {
    reconciled = (await reconcileWorkspaceScans(getPool())).length;
  } catch (cause) {
    logFailure("reconcile_stuck_completions", cause);
  }

  return NextResponse.json({ notified, reclaimed, reconciled }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
