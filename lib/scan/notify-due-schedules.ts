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

const SAVEPOINT = "notify_due_schedule";

/**
 * One workspace-scoped notification row per due schedule (never per member --
 * `notifyWithRepository` itself fans out to every accepted member). Advancing
 * `next_run_at` happens even when notifying is skipped or fails: the schedule
 * must never be re-evaluated as due on every 5-minute tick for a month just
 * because a workspace downgraded or turned digests off. This never calls
 * `enqueueRescan` -- the owner still clicks "Rescan now" through the
 * unmodified consent flow (the consent gate cannot be satisfied by a
 * machine; see the design doc's "Constraints this design is shaped by").
 *
 * Runs inside one transaction. Each schedule is wrapped in its own
 * SAVEPOINT/ROLLBACK TO SAVEPOINT: a schedule that fails (e.g. a transient
 * DB error in advanceSchedule) is rolled back to before its own work only,
 * and the loop continues with the next schedule -- one bad row never blocks
 * every other due schedule's advance/notification for the whole tick.
 * `notifyWithRepository` already swallows its own errors rather than
 * throwing, so a failed notify insert alone never triggers this path; it's
 * here for the rarer case of `advanceSchedule` or `nextRunAfter` itself
 * failing.
 */
export async function notifyDueSchedules(nowIso: string): Promise<NotifyDueSchedulesResult> {
  return withTransaction(async (client) => {
    const repo = schedulerRepository(client);
    const due = await repo.dueSchedules(nowIso);
    let notified = 0;

    for (const schedule of due) {
      try {
        await client.query(`SAVEPOINT ${SAVEPOINT}`);
        await repo.advanceSchedule(schedule.id, nextRunAfter(nowIso, schedule.anniversaryDay));
        if (await notifyOneDueSchedule(client, schedule)) notified += 1;
        await client.query(`RELEASE SAVEPOINT ${SAVEPOINT}`);
      } catch (cause) {
        await client.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`).catch(() => {});
        console.error("[scan/notify-due-schedules] schedule processing failed", {
          category: "notify_due_schedule_failed",
          scheduleId: schedule.id,
          message: cause instanceof Error ? cause.message : "unknown",
        });
      }
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
