import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getPool } from "@/lib/db/client";
import { authorizeCronRequest, cronUnauthorizedResponse } from "@/lib/security/cron-auth";
import { notifyDueSchedules } from "@/lib/scan/notify-due-schedules";
import { schedulerRepository } from "@/lib/repositories/scheduler";
import { reconcileWorkspaceScans } from "@/lib/workspace/completion";
import { applicationRepository } from "@/lib/repositories/applications";
import { verificationRepository } from "@/lib/repositories/verification";
import { recordApplication } from "@/lib/workspace/applications";
import { recordNeonEvent } from "@/lib/workspace/audit";
import { runWebsiteVerification } from "@/lib/verify/website-sweep";

export const maxDuration = 60;

const RECLAIM_BATCH_LIMIT = 20;
/**
 * Bounds ONE tick rather than rationing throughput: this is the only concern
 * here that fetches customer infrastructure, and the five fetches run in
 * parallel under runWebsiteChecks' 5s timeout, so the cap is about not
 * spending the route's 60s budget, not about how much work gets done per day.
 */
const VERIFY_LOCATION_LIMIT = 5;

function logFailure(step: string, cause: unknown) {
  console.error(`[cron/dispatch] ${step} failed`, {
    category: "cron_dispatch_step_failed",
    step,
    message: cause instanceof Error ? cause.message : "unknown",
  });
}

function summarizeByStatus(results: { status: string }[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const result of results) {
    summary[result.status] = (summary[result.status] ?? 0) + 1;
  }
  return summary;
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

  let reclaimCandidates = 0;
  try {
    const jobIds = await schedulerRepository().claimableJobIds(RECLAIM_BATCH_LIMIT);
    reclaimCandidates = jobIds.length;
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
    } else if (jobIds.length > 0) {
      logFailure("reclaim_abandoned_scans", new Error("APP_ORIGIN not configured -- found eligible jobs but could not dispatch any"));
    }
  } catch (cause) {
    logFailure("reclaim_abandoned_scans", cause);
  }

  let reconciled: Record<string, number> = {};
  try {
    reconciled = summarizeByStatus(await reconcileWorkspaceScans(getPool()));
  } catch (cause) {
    logFailure("reconcile_stuck_completions", cause);
  }

  let verified = { locationsChecked: 0, actionsVerified: 0 };
  try {
    verified = await runWebsiteVerification(
      verificationRepository(),
      {
        record: async (row) => {
          await recordApplication(applicationRepository(), row);
          await recordNeonEvent({
            workspaceId: row.workspaceId,
            actorType: "system",
            event: "action.verified",
            entityType: "action",
            entityId: row.actionId,
            payload: { checks: row.evidence.checks },
          });
        },
      },
      { now: new Date(), limit: VERIFY_LOCATION_LIMIT },
    );
  } catch (cause) {
    logFailure("verify_website_actions", cause);
  }

  return NextResponse.json({ notified, reclaimCandidates, reconciled, verified }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
