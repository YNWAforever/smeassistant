import "server-only";
import type { PoolClient } from "pg";
import { withTransaction } from "@/lib/db/transaction";
import { nextRunAfter } from "@/lib/scheduler/next-run";
import { notifyWithRepository } from "@/lib/workspace/notify";
import { notificationRepository } from "@/lib/repositories/notifications";
import { workspaceHref } from "@/lib/workspace/post-process";
import { localized } from "@/lib/domain";
import { schedulerRepository, type DueSchedule } from "@/lib/repositories/scheduler";

export interface NotifyDueSchedulesResult {
  due: number;
  notified: number;
}

/**
 * One workspace-scoped notification row per due schedule (never per member --
 * `notifyWithRepository` itself fans out to every accepted member). Advancing
 * `next_run_at` happens even when notifying is skipped or fails: the schedule
 * must never be re-evaluated as due on every 5-minute tick for a month just
 * because a workspace downgraded or turned digests off. This never calls
 * `enqueueRescan` -- the owner still clicks "Rescan now" through the
 * unmodified consent flow (design doc: "Auto-consent").
 *
 * Runs inside one transaction: `notifyWithRepository` already swallows its
 * own errors rather than throwing, so one workspace's failed notify insert
 * cannot roll back another schedule's already-applied advance.
 */
export async function notifyDueSchedules(nowIso: string): Promise<NotifyDueSchedulesResult> {
  return withTransaction(async (client) => {
    const repo = schedulerRepository(client);
    const due = await repo.dueSchedules(nowIso);
    let notified = 0;

    for (const schedule of due) {
      await repo.advanceSchedule(schedule.id, nextRunAfter(nowIso, schedule.anniversaryDay));
      if (await notifyOneDueSchedule(client, schedule)) notified += 1;
    }

    return { due: due.length, notified };
  });
}

async function notifyOneDueSchedule(client: PoolClient, schedule: DueSchedule): Promise<boolean> {
  if (!schedule.workspaceId || schedule.tier !== "paid" || schedule.notifyMonthlyDigest !== true) return false;

  const outcome = await notifyWithRepository(notificationRepository(client), {
    workspaceId: schedule.workspaceId,
    kind: "schedule.due",
    title: localized("Your monthly rescan is ready", "您嘅每月重新掃描已就緒", "您的每月重新掃描已就緒"),
    body: localized(
      "Run it from your workspace whenever you're ready -- nothing happens automatically.",
      "喺您方便嘅時候喺工作區執行 -- 系統唔會自動進行。",
      "在您方便的時候在工作區執行 -- 系統不會自動進行。",
    ),
    href: await workspaceHref(client, schedule.workspaceId, null),
  });
  return !outcome.error;
}
