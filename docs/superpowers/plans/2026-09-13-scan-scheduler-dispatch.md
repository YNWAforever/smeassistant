# Scan Scheduler Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one Vercel Cron (every 5 minutes) that notifies owners of due monthly rescans, reclaims scans abandoned mid-collection, and reconciles workspace-completion effects that never finished — closing the one real gap in Phase 3 item P3.1.

**Architecture:** One new authenticated route (`app/api/cron/dispatch`) runs three independent, individually-failure-isolated concerns in sequence: (1) a business-logic module queries due `scan_schedules`, always advances their `next_run_at`, and in-app-notifies only paid/opted-in workspaces (never auto-dispatches a scan — the owner still clicks "Rescan now" through the unchanged consent flow); (2) a repository query finds jobs stuck mid-collection or still queued and fires an unawaited, `waitUntil`-kept-alive `POST /api/scan/process` per job, so each reclaimed scan runs as its own independently-budgeted function invocation; (3) the route calls the already-existing `reconcileWorkspaceScans` directly, in-process, no HTTP hop.

**Tech Stack:** Next.js 16 route handlers, `pg` (node-postgres), Vitest 4, `@vercel/functions` `waitUntil`, Docker-backed Postgres integration tests (`NEON_INTEGRATION=1`, already configured).

---

## Before you start

Read [docs/superpowers/specs/2026-09-13-scan-scheduler-trigger-design.md](../specs/2026-09-13-scan-scheduler-trigger-design.md) — the approved design this plan implements. Key facts from it that shape every task below:

- The claim lease (`lib/scan/execution-store.ts::claimJob`) and the completion receiver (`lib/workspace/completion.ts`) already exist and are unmodified except for one small, safe refactor in Task 1.
- `WORKSPACE_COMPLETION_ENABLED` gates only the HTTP route `app/api/internal/workspace-scan-completion` — this plan never touches that flag or that route, because Task 5's route calls `reconcileWorkspaceScans` as a plain function import, not over HTTP.
- The consent gate (`lib/scan/consent.ts`) is never touched or bypassed. This plan never calls `enqueueRescan`. Notifications only ever tell an owner a rescan is ready; the owner still clicks the button.
- `scan_schedules.workspace_id` is nullable in the schema (`neon/migrations/0002_business.sql:386`) even though every schedule the app itself creates always sets it (`lib/scheduler/create-schedule.ts`). Treat a null defensively: still advance `next_run_at`, just skip notifying.
- Vercel is confirmed Pro plan — cron can run every 5 minutes, no workaround needed.

Run this before Task 1 to confirm your baseline is current:

```bash
git fetch origin
git log --oneline -1 origin/main
```

Expected: this matches your current `HEAD` (this plan was written against `943281b`, `main` after PR #14).

---

### Task 1: Extract the shared claimable-job predicate

**Files:**
- Create: `lib/scan/claimable.ts`
- Modify: `lib/scan/execution-store.ts:29-38` (the `claimJob` method body)
- Test: existing `lib/scan/execution-store.test.ts` (no new test — this is a pure extraction; the existing suite plus Task 7's integration test are the regression guard)

The claim lease's WHERE clause today lives only inline inside one UPDATE statement in `execution-store.ts`. Task 3's new repository needs the exact same condition for a SELECT. Duplicating the raw SQL string in two places is how the two conditions quietly drift apart later — extract it once now.

- [ ] **Step 1: Read the current `claimJob` implementation to copy it exactly**

```bash
grep -n -A 12 "async claimJob" lib/scan/execution-store.ts
```

Expected output (confirm this matches before editing — if it doesn't, stop and re-read the file instead of guessing):

```ts
    async claimJob(jobId) {
      try {
        const result = await pool().query(
          `UPDATE audit_jobs SET status='collecting',processing_stage='collecting',attempt_count=attempt_count+1,last_attempt_at=now()
     WHERE id=$1 AND (status='queued' OR (status IN ('collecting','scoring','persisting') AND attempt_count<3 AND last_attempt_at IS NOT NULL AND last_attempt_at<now()-interval '30 minutes')) RETURNING *`,
          [jobId],
        );
        return asClaimedJob(result.rows);
      } catch {
        throw new Error("claim_failed");
      }
    },
```

- [ ] **Step 2: Create the shared constant**

Create `lib/scan/claimable.ts`:

```ts
/**
 * The claim lease's own eligibility rule (`lib/scan/execution-store.ts::claimJob`):
 * a fresh queued job, or one stuck mid-collection for over 30 minutes with
 * fewer than 3 total attempts. Shared so a SELECT elsewhere (the scheduler's
 * reclaim query, Task 3) can never drift from what the claim UPDATE actually
 * allows.
 */
export const CLAIMABLE_JOB_CONDITION_SQL =
  "(status='queued' OR (status IN ('collecting','scoring','persisting') AND attempt_count<3 AND last_attempt_at IS NOT NULL AND last_attempt_at<now()-interval '30 minutes'))";
```

- [ ] **Step 3: Use the constant in `execution-store.ts`**

Add the import near the top of `lib/scan/execution-store.ts` (alongside the existing imports from `"./..."`):

```ts
import { CLAIMABLE_JOB_CONDITION_SQL } from "./claimable";
```

Replace the `claimJob` method body's query call with:

```ts
    async claimJob(jobId) {
      try {
        const result = await pool().query(
          `UPDATE audit_jobs SET status='collecting',processing_stage='collecting',attempt_count=attempt_count+1,last_attempt_at=now()
     WHERE id=$1 AND ${CLAIMABLE_JOB_CONDITION_SQL} RETURNING *`,
          [jobId],
        );
        return asClaimedJob(result.rows);
      } catch {
        throw new Error("claim_failed");
      }
    },
```

- [ ] **Step 4: Confirm nothing regressed**

```bash
corepack pnpm vitest run lib/scan/execution-store.test.ts
```

Expected: all existing tests in this file still PASS (this refactor changes zero behavior — same SQL string, assembled differently).

- [ ] **Step 5: Commit**

```bash
git add lib/scan/claimable.ts lib/scan/execution-store.ts
git commit -m "refactor: extract the claimable-job predicate so a future reclaim query can't drift from the claim lease"
```

---

### Task 2: Add the `schedule.due` notification kind and expose `workspaceHref`

**Files:**
- Modify: `lib/workspace/notify.ts:14-20` (the `NOTIFICATION_KINDS` array)
- Modify: `lib/workspace/post-process.ts:41` (add `export` to `workspaceHref`)
- Test: `lib/workspace/notify-repository.test.ts` (add one case)

- [ ] **Step 1: Write the failing test**

Open `lib/workspace/notify-repository.test.ts` and add this case inside its existing `describe` block (match the file's existing style — read the file first to place it consistently with neighboring cases):

```ts
  it("accepts the schedule.due kind", async () => {
    const insert = vi.fn().mockResolvedValue(1);
    const repo = {
      acceptedMemberIds: vi.fn().mockResolvedValue(["user-1"]),
      insert,
      hasSince: vi.fn(),
      workspaceSlug: vi.fn(),
    };
    const outcome = await notifyWithRepository(repo, {
      workspaceId: "ws-1",
      kind: "schedule.due",
      title: { en: "Ready", "zh-HK": "已就緒", "zh-TW": "已就緒" },
    });
    expect(outcome.error).toBeNull();
    expect(insert).toHaveBeenCalledWith(
      [expect.objectContaining({ kind: "schedule.due", workspace_id: "ws-1", user_id: "user-1" })],
      false,
    );
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
corepack pnpm vitest run lib/workspace/notify-repository.test.ts
```

Expected: FAIL — TypeScript rejects `kind: "schedule.due"` because it isn't in the `NotificationKind` union yet.

- [ ] **Step 3: Add the kind**

In `lib/workspace/notify.ts`, change:

```ts
export const NOTIFICATION_KINDS = [
  "scan.completed",
  "scan.failed",
  "version.approved",
  "delivery.exported",
  "usage.allowance_80",
] as const;
```

to:

```ts
export const NOTIFICATION_KINDS = [
  "scan.completed",
  "scan.failed",
  "version.approved",
  "delivery.exported",
  "usage.allowance_80",
  "schedule.due",
] as const;
```

- [ ] **Step 4: Run it to verify it passes**

```bash
corepack pnpm vitest run lib/workspace/notify-repository.test.ts
```

Expected: PASS.

- [ ] **Step 5: Export `workspaceHref` for reuse**

In `lib/workspace/post-process.ts`, change:

```ts
async function workspaceHref(db: PoolClient, workspaceId: string, locationId: string | null): Promise<string | null> {
```

to:

```ts
export async function workspaceHref(db: PoolClient, workspaceId: string, locationId: string | null): Promise<string | null> {
```

This is a pure visibility change — no behavior differs, so no new test is needed for it. Confirm the module still compiles:

```bash
corepack pnpm tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add lib/workspace/notify.ts lib/workspace/notify-repository.test.ts lib/workspace/post-process.ts
git commit -m "feat: add schedule.due notification kind and export workspaceHref for reuse"
```

---

### Task 3: New repository — due schedules and claimable jobs

**Files:**
- Create: `lib/repositories/scheduler.ts`
- No dedicated unit test — this repo follows the existing convention (`lib/repositories/rescan.ts`, `lib/repositories/notifications.ts` have none either); its two queries are verified by Task 7's Docker-Postgres integration test, which is the pattern this codebase already uses for thin SQL wrappers.

`dueSchedules`'s SELECT carries `FOR UPDATE OF s SKIP LOCKED`, the same idiom `lib/repositories/action-run-reaper.ts` already uses for exactly this reason: two overlapping cron ticks (a slow tick still running when the next one starts) must take disjoint schedule rows, not the same one twice. Without it, both ticks could read the same due schedule before either advances its `next_run_at`, producing a duplicate "your rescan is ready" notification. `FOR UPDATE OF s` scopes the lock to the `scan_schedules` row only — the joined `workspaces` row stays unlocked, since only the schedule's own advance-state needs protecting. This only works because Task 4 (not this one) runs `dueSchedules` and `advanceSchedule` inside one `withTransaction` — the lock is held only as long as that transaction is open.

- [ ] **Step 1: Create the repository**

```ts
import "server-only";
import type { Pool } from "pg";
import { getPool } from "../db/client";
import { CLAIMABLE_JOB_CONDITION_SQL } from "../scan/claimable";

export interface DueSchedule {
  id: string;
  workspaceId: string | null;
  anniversaryDay: number;
  tier: string | null;
  notifyMonthlyDigest: boolean | null;
}

export interface SchedulerRepository {
  dueSchedules(nowIso: string): Promise<DueSchedule[]>;
  advanceSchedule(scheduleId: string, nextRunAtIso: string): Promise<void>;
  claimableJobIds(limit: number): Promise<string[]>;
}

/**
 * Backs `app/api/cron/dispatch` (Phase 3 item P3.1). Schedules and jobs only;
 * writing the actual notification row is `lib/workspace/notify.ts`'s job, not
 * this repository's.
 */
export function schedulerRepository(client?: Pick<Pool, "query">): SchedulerRepository {
  const db = () => client ?? getPool();
  return {
    // FOR UPDATE OF s SKIP LOCKED only closes the concurrent-tick race
    // (two overlapping cron ticks double-notifying the same schedule) when
    // the caller runs this and the matching advanceSchedule() in one shared
    // transaction -- the lock is released the moment this call's own
    // transaction ends, not held across separate calls.
    async dueSchedules(nowIso) {
      try {
        return (
          await db().query<DueSchedule>(
            `SELECT s.id, s.workspace_id AS "workspaceId", s.anniversary_day AS "anniversaryDay",
                    w.tier, w.notify_monthly_digest AS "notifyMonthlyDigest"
             FROM scan_schedules s
             LEFT JOIN workspaces w ON w.id = s.workspace_id
             WHERE s.cadence = 'monthly' AND s.next_run_at <= $1
             FOR UPDATE OF s SKIP LOCKED`,
            [nowIso],
          )
        ).rows;
      } catch {
        throw new Error("due_schedules_lookup_failed");
      }
    },
    async advanceSchedule(scheduleId, nextRunAtIso) {
      try {
        await db().query("UPDATE scan_schedules SET next_run_at=$2 WHERE id=$1", [scheduleId, nextRunAtIso]);
      } catch {
        throw new Error("schedule_advance_failed");
      }
    },
    async claimableJobIds(limit) {
      try {
        return (
          await db().query<{ id: string }>(
            `SELECT id FROM audit_jobs WHERE ${CLAIMABLE_JOB_CONDITION_SQL} LIMIT $1`,
            [limit],
          )
        ).rows.map((row) => row.id);
      } catch {
        throw new Error("claimable_jobs_lookup_failed");
      }
    },
  };
}
```

- [ ] **Step 2: Confirm it compiles**

```bash
corepack pnpm tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/repositories/scheduler.ts
git commit -m "feat: add the scheduler repository (due schedules, claimable jobs)"
```

---

### Task 4: Business logic — notify due schedules

**Files:**
- Create: `lib/scan/notify-due-schedules.ts`
- Test: `lib/scan/notify-due-schedules.test.ts`

This is the piece with real decision logic (tier/preference gating, always-advance-regardless), so — unlike Task 3's thin repository — it gets its own mocked-dependency unit test, matching how `lib/workspace/rescan.ts` (business logic) has `rescan.test.ts` while its repository does not.

- [ ] **Step 1: Write the failing test**

Create `lib/scan/notify-due-schedules.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { notifyDueSchedules } from "./notify-due-schedules";

const { notifyWithRepository, workspaceHref, dueSchedules, advanceSchedule } = vi.hoisted(() => ({
  notifyWithRepository: vi.fn(),
  workspaceHref: vi.fn(),
  dueSchedules: vi.fn(),
  advanceSchedule: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/workspace/notify", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace/notify")>()),
  notifyWithRepository,
}));
vi.mock("@/lib/workspace/post-process", () => ({ workspaceHref }));
vi.mock("@/lib/repositories/scheduler", () => ({ schedulerRepository: () => ({ dueSchedules, advanceSchedule, claimableJobIds: vi.fn() }) }));
vi.mock("@/lib/repositories/notifications", () => ({ notificationRepository: () => ({}) }));
vi.mock("@/lib/db/transaction", () => ({ withTransaction: (run: (client: unknown) => Promise<unknown>) => run({}) }));

function schedule(overrides: Partial<{ id: string; workspaceId: string | null; anniversaryDay: number; tier: string | null; notifyMonthlyDigest: boolean | null }> = {}) {
  return { id: "sched-1", workspaceId: "ws-1", anniversaryDay: 15, tier: "paid", notifyMonthlyDigest: true, ...overrides };
}

describe("notifyDueSchedules", () => {
  it("advances the schedule and notifies a paid, opted-in workspace", async () => {
    dueSchedules.mockResolvedValue([schedule()]);
    workspaceHref.mockResolvedValue("/owner/kam-man-house");
    notifyWithRepository.mockResolvedValue({ inserted: 1, error: null });

    const result = await notifyDueSchedules("2026-09-13T00:00:00.000Z");

    expect(result).toEqual({ due: 1, notified: 1 });
    expect(advanceSchedule).toHaveBeenCalledWith("sched-1", expect.any(String));
    expect(notifyWithRepository).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ workspaceId: "ws-1", kind: "schedule.due", href: "/owner/kam-man-house" }),
    );
  });

  it("advances the schedule but skips notifying a lite-tier workspace", async () => {
    dueSchedules.mockResolvedValue([schedule({ tier: "lite" })]);

    const result = await notifyDueSchedules("2026-09-13T00:00:00.000Z");

    expect(result).toEqual({ due: 1, notified: 0 });
    expect(advanceSchedule).toHaveBeenCalledWith("sched-1", expect.any(String));
    expect(notifyWithRepository).not.toHaveBeenCalled();
  });

  it("advances the schedule but skips notifying when digests are off", async () => {
    dueSchedules.mockResolvedValue([schedule({ notifyMonthlyDigest: false })]);

    const result = await notifyDueSchedules("2026-09-13T00:00:00.000Z");

    expect(result).toEqual({ due: 1, notified: 0 });
    expect(notifyWithRepository).not.toHaveBeenCalled();
  });

  it("advances the schedule but skips notifying when the workspace id is null", async () => {
    dueSchedules.mockResolvedValue([schedule({ workspaceId: null, tier: null, notifyMonthlyDigest: null })]);

    const result = await notifyDueSchedules("2026-09-13T00:00:00.000Z");

    expect(result).toEqual({ due: 1, notified: 0 });
    expect(advanceSchedule).toHaveBeenCalledWith("sched-1", expect.any(String));
    expect(notifyWithRepository).not.toHaveBeenCalled();
  });

  it("counts a notify failure as due but not notified", async () => {
    dueSchedules.mockResolvedValue([schedule()]);
    workspaceHref.mockResolvedValue(null);
    notifyWithRepository.mockResolvedValue({ inserted: 0, error: "notification insert failed" });

    const result = await notifyDueSchedules("2026-09-13T00:00:00.000Z");

    expect(result).toEqual({ due: 1, notified: 0 });
  });

  it("returns zero for both counts when nothing is due", async () => {
    dueSchedules.mockResolvedValue([]);

    expect(await notifyDueSchedules("2026-09-13T00:00:00.000Z")).toEqual({ due: 0, notified: 0 });
    expect(advanceSchedule).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
corepack pnpm vitest run lib/scan/notify-due-schedules.test.ts
```

Expected: FAIL — `./notify-due-schedules` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `lib/scan/notify-due-schedules.ts`. This runs inside one transaction: `notifyWithRepository` already swallows its own errors rather than throwing, so one workspace's failed notify insert cannot roll back another schedule's already-applied advance.

```ts
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
```

- [ ] **Step 4: Run it to verify it passes**

```bash
corepack pnpm vitest run lib/scan/notify-due-schedules.test.ts
```

Expected: PASS, all 6 cases.

- [ ] **Step 5: Typecheck**

```bash
corepack pnpm tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add lib/scan/notify-due-schedules.ts lib/scan/notify-due-schedules.test.ts
git commit -m "feat: notify due monthly rescan schedules without auto-dispatching a scan"
```

---

### Task 5: The cron route

**Files:**
- Create: `app/api/cron/dispatch/route.ts`
- Test: `app/api/cron/dispatch/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/api/cron/dispatch/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { notifyDueSchedules, claimableJobIds, reconcileWorkspaceScans, getPool, waitUntilMock, fetchMock } = vi.hoisted(() => ({
  notifyDueSchedules: vi.fn(),
  claimableJobIds: vi.fn(),
  reconcileWorkspaceScans: vi.fn(),
  getPool: vi.fn(() => ({})),
  waitUntilMock: vi.fn(),
  fetchMock: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ getPool }));
vi.mock("@/lib/scan/notify-due-schedules", () => ({ notifyDueSchedules }));
vi.mock("@/lib/repositories/scheduler", () => ({ schedulerRepository: () => ({ claimableJobIds }) }));
vi.mock("@/lib/workspace/completion", () => ({ reconcileWorkspaceScans }));
vi.mock("@vercel/functions", () => ({ waitUntil: waitUntilMock }));

import { POST } from "./route";

const SECRET = "a".repeat(32);

function request(token = SECRET) {
  return new Request("http://localhost/api/cron/dispatch", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("APP_ORIGIN", "https://app.example.test");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response("{}"));
  notifyDueSchedules.mockResolvedValue({ due: 0, notified: 0 });
  claimableJobIds.mockResolvedValue([]);
  reconcileWorkspaceScans.mockResolvedValue([]);
});

describe("POST /api/cron/dispatch", () => {
  it("rejects an unauthenticated request before touching anything", async () => {
    const response = await POST(request(""));
    expect(response.status).toBe(401);
    expect(notifyDueSchedules).not.toHaveBeenCalled();
    expect(getPool).not.toHaveBeenCalled();
  });

  it("rejects the wrong secret", async () => {
    const response = await POST(request("b".repeat(32)));
    expect(response.status).toBe(401);
  });

  it("runs all three concerns and summarizes the result", async () => {
    notifyDueSchedules.mockResolvedValue({ due: 2, notified: 1 });
    claimableJobIds.mockResolvedValue(["job-1", "job-2"]);
    reconcileWorkspaceScans.mockResolvedValue([{ status: "completed" }]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notified: { due: 2, notified: 1 }, reclaimed: 2, reconciled: 1 });
  });

  it("fires an unawaited, kept-alive scan/process call per claimable job", async () => {
    claimableJobIds.mockResolvedValue(["job-1", "job-2"]);

    await POST(request());

    expect(waitUntilMock).toHaveBeenCalledTimes(2);
    // waitUntil is called with the fetch promise; resolve it to exercise the real fetch call.
    await Promise.all(waitUntilMock.mock.calls.map(([promise]) => promise));
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.example.test/api/scan/process",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ jobId: "job-1" }) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.example.test/api/scan/process",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ jobId: "job-2" }) }),
    );
  });

  it("skips dispatching reclaim requests when APP_ORIGIN is not configured, but still reports the count", async () => {
    vi.stubEnv("APP_ORIGIN", "");
    claimableJobIds.mockResolvedValue(["job-1"]);

    const response = await POST(request());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(waitUntilMock).not.toHaveBeenCalled();
    expect((await response.json()).reclaimed).toBe(1);
  });

  it("still reconciles and reclaims when notifying due schedules throws", async () => {
    notifyDueSchedules.mockRejectedValue(new Error("boom"));
    claimableJobIds.mockResolvedValue(["job-1"]);
    reconcileWorkspaceScans.mockResolvedValue([{ status: "retry" }]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reclaimed).toBe(1);
    expect(body.reconciled).toBe(1);
  });

  it("still notifies and reclaims when reconciling throws", async () => {
    notifyDueSchedules.mockResolvedValue({ due: 1, notified: 1 });
    reconcileWorkspaceScans.mockRejectedValue(new Error("boom"));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notified: { due: 1, notified: 1 }, reclaimed: 0, reconciled: 0 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
corepack pnpm vitest run app/api/cron/dispatch/route.test.ts
```

Expected: FAIL — `./route` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `app/api/cron/dispatch/route.ts`:

```ts
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
```

- [ ] **Step 4: Run it to verify it passes**

```bash
corepack pnpm vitest run app/api/cron/dispatch/route.test.ts
```

Expected: PASS, all 7 cases.

- [ ] **Step 5: Typecheck and lint**

```bash
corepack pnpm tsc --noEmit && corepack pnpm lint
```

Expected: no new errors or warnings.

- [ ] **Step 6: Commit**

```bash
git add app/api/cron/dispatch/route.ts app/api/cron/dispatch/route.test.ts
git commit -m "feat: add the cron dispatch route (notify, reclaim, reconcile)"
```

---

### Task 6: Register the cron and update the architecture test

**Files:**
- Modify: `vercel.json`
- Modify: `tests/cron-registration.test.ts`
- Modify: `.env.example:44`

- [ ] **Step 1: Read the current files to confirm exact content before editing**

```bash
cat vercel.json
cat tests/cron-registration.test.ts
```

Expected `vercel.json`:

```json
{
  "git": {
    "deploymentEnabled": {
      "codex/merchant-acceptance-completion": false,
      "codex/neon-migration": false
    }
  }
}
```

- [ ] **Step 2: Write the failing test**

Replace the body of the `it` block in `tests/cron-registration.test.ts` (keep the file's existing imports and JSON-read setup unchanged above it):

```ts
describe("cron registration", () => {
  it("registers exactly the one authorized dispatch cron, on a 5-minute schedule", () => {
    expect(vercelConfig.crons ?? []).toEqual([
      { path: "/api/cron/dispatch", schedule: "*/5 * * * *" },
    ]);
  });
});
```

Also update the file's leading comment (currently explaining why crons must stay empty) to record why this changed -- replace it with:

```ts
/**
 * The Vercel project is now on the Pro plan (confirmed 2026-09-13), and the
 * legacy Cloudflare scheduler this rule used to defer to no longer exists --
 * the Neon migration cut that relationship (docs/integration/NEON-RUNNER-COMPATIBILITY.md).
 * `app/api/cron/dispatch` is now the one retained, authorized scheduler
 * (design doc: docs/superpowers/specs/2026-09-13-scan-scheduler-trigger-design.md).
 * This test still guards the "one scheduler" principle: it fails loudly if a
 * second cron is ever added, rather than silently allowing an unbounded list.
 */
```

- [ ] **Step 3: Run it to verify it fails**

```bash
corepack pnpm vitest run tests/cron-registration.test.ts
```

Expected: FAIL — `vercel.json` has no `crons` key yet, so `vercelConfig.crons ?? []` is `[]`, not the expected one-entry array.

- [ ] **Step 4: Update `vercel.json`**

```json
{
  "git": {
    "deploymentEnabled": {
      "codex/merchant-acceptance-completion": false,
      "codex/neon-migration": false
    }
  },
  "crons": [
    { "path": "/api/cron/dispatch", "schedule": "*/5 * * * *" }
  ]
}
```

- [ ] **Step 5: Run it to verify it passes**

```bash
corepack pnpm vitest run tests/cron-registration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Tighten the `.env.example` comment for `CRON_SECRET`**

Change line 44 of `.env.example` from:

```
CRON_SECRET=                                                   # ≥ 16 chars; only if this app ever exposes cron/worker callbacks
```

to:

```
CRON_SECRET=                                                   # ≥ 16 chars; required in production -- authorizes app/api/cron/dispatch
```

- [ ] **Step 7: Commit**

```bash
git add vercel.json tests/cron-registration.test.ts .env.example
git commit -m "feat: register the dispatch cron on a 5-minute schedule (Vercel Pro)"
```

---

### Task 7: Docker-Postgres integration test

**Files:**
- Create: `test/integration/neon-cron-dispatch.integration.test.ts`

This exercises Tasks 3 and 4 against a real, migrated Postgres instance -- the actual SQL, not a mock. It follows the exact pattern already used by `test/integration/neon-rescan.integration.test.ts` (same fixture bootstrap, same `describe.runIf`, same explicit fetch-forbidding stub for anything this test doesn't expect to call over the network).

- [ ] **Step 1: Confirm Docker is available**

```bash
docker version --format '{{.Server.Version}}'
```

Expected: a version string (this plan was written and verified against Docker 29.7.2). If this fails, stop -- this task cannot be verified without it, and skipping straight to "should work" is exactly the kind of unverified assumption this plan is trying to avoid.

- [ ] **Step 2: Write the test**

Create `test/integration/neon-cron-dispatch.integration.test.ts`:

```ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { schedulerRepository } from "../../lib/repositories/scheduler";
import { notifyDueSchedules } from "../../lib/scan/notify-due-schedules";

const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock("../../lib/db/client", () => ({ getPool: () => ports.pool, getDatabase: () => drizzle(ports.pool!) }));

describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon cron dispatch: due schedules and claimable jobs", () => {
  let fixture: NeonDatabaseFixture, owner: Pool, runtime: Pool;

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query(
      "CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime",
    );
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href });
    ports.pool = runtime;
  });

  beforeEach(async () => {
    vi.stubGlobal("fetch", () => {
      throw new Error("transport forbidden");
    });
    await runtime.query("DELETE FROM scan_schedules; DELETE FROM audit_jobs; DELETE FROM workspaces; DELETE FROM app_users");
  });

  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    await Promise.all([owner?.end(), runtime?.end()]);
    fixture?.stop();
  });

  async function workspace(overrides: { tier?: string; notify_monthly_digest?: boolean } = {}) {
    return (
      await runtime.query(
        "INSERT INTO workspaces(slug,market,tier,notify_monthly_digest) VALUES($1,'hk',$2,$3) RETURNING id",
        [`ws-${crypto.randomUUID()}`, overrides.tier ?? "paid", overrides.notify_monthly_digest ?? true],
      )
    ).rows[0].id;
  }

  async function member(workspaceId: string) {
    const user = (await runtime.query("INSERT INTO app_users(email) VALUES($1) RETURNING id", [`${crypto.randomUUID()}@example.test`])).rows[0].id;
    await runtime.query(
      "INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,$3,'owner',now())",
      [workspaceId, user, `${user}@example.test`],
    );
    return user;
  }

  async function schedule(workspaceId: string | null, nextRunAt: string) {
    return (
      await runtime.query(
        "INSERT INTO scan_schedules(place_id,input_snapshot,cadence,anniversary_day,next_run_at,created_by,workspace_id) VALUES($1,'{}'::jsonb,'monthly',15,$2,$3,$4) RETURNING id",
        [`place-${crypto.randomUUID()}`, nextRunAt, workspaceId ? await member(workspaceId) : (await runtime.query("INSERT INTO app_users(email) VALUES($1) RETURNING id", [`${crypto.randomUUID()}@example.test`])).rows[0].id, workspaceId],
      )
    ).rows[0].id;
  }

  it("finds a due schedule, notifies its paid opted-in workspace, and advances next_run_at", async () => {
    const ws = await workspace();
    await member(ws);
    const scheduleId = await schedule(ws, "2026-09-01T00:00:00Z");

    const result = await notifyDueSchedules("2026-09-13T00:00:00Z");

    expect(result).toEqual({ due: 1, notified: 1 });
    expect((await runtime.query("SELECT next_run_at FROM scan_schedules WHERE id=$1", [scheduleId])).rows[0].next_run_at.toISOString()).toBe(
      "2026-10-15T00:00:00.000Z",
    );
    expect((await runtime.query("SELECT kind,workspace_id FROM workspace_notifications WHERE workspace_id=$1", [ws])).rows).toEqual([
      { kind: "schedule.due", workspace_id: ws },
    ]);
  });

  it("advances a lite-tier workspace's schedule without creating a notification", async () => {
    const ws = await workspace({ tier: "lite" });
    await member(ws);
    const scheduleId = await schedule(ws, "2026-09-01T00:00:00Z");

    const result = await notifyDueSchedules("2026-09-13T00:00:00Z");

    expect(result).toEqual({ due: 1, notified: 0 });
    expect((await runtime.query("SELECT next_run_at FROM scan_schedules WHERE id=$1", [scheduleId])).rows[0].next_run_at).not.toBeNull();
    expect((await runtime.query("SELECT id FROM workspace_notifications WHERE workspace_id=$1", [ws])).rows).toEqual([]);
  });

  it("ignores a schedule that is not yet due", async () => {
    const ws = await workspace();
    await schedule(ws, "2026-12-01T00:00:00Z");

    expect(await notifyDueSchedules("2026-09-13T00:00:00Z")).toEqual({ due: 0, notified: 0 });
  });

  it("finds a fresh queued job and a stale mid-collection job, but not a fresh in-flight one", async () => {
    const ws = await workspace();
    const queued = (await runtime.query("INSERT INTO audit_jobs(business_name,status) VALUES('Queued','queued') RETURNING id")).rows[0].id;
    const stale = (
      await runtime.query(
        "INSERT INTO audit_jobs(business_name,status,attempt_count,last_attempt_at) VALUES('Stale','collecting',1,now()-interval '31 minutes') RETURNING id",
      )
    ).rows[0].id;
    await runtime.query(
      "INSERT INTO audit_jobs(business_name,status,attempt_count,last_attempt_at) VALUES('Fresh in-flight','collecting',1,now())",
    );
    await runtime.query(
      "INSERT INTO audit_jobs(business_name,status,attempt_count,last_attempt_at) VALUES('Exhausted','collecting',3,now()-interval '31 minutes')",
    );
    void ws;

    const ids = await schedulerRepository(runtime).claimableJobIds(20);

    expect(new Set(ids)).toEqual(new Set([queued, stale]));
  });
});
```

- [ ] **Step 3: Run it**

```bash
corepack pnpm vitest run --config vitest.integration.config.ts test/integration/neon-cron-dispatch.integration.test.ts
```

Expected: PASS, all 4 cases. If a case fails, read the actual error before changing assertions -- in particular, double check the exact column list `INSERT INTO workspace_members` accepts by reading `neon/migrations/0002_business.sql`'s `workspace_members` definition; do not guess a column name.

- [ ] **Step 4: Run the full integration suite to confirm no cross-test interference**

```bash
corepack pnpm test:integration
```

Expected: PASS (this suite runs with `fileParallelism: false`, so this also confirms the new file's `DELETE FROM` cleanup in `beforeEach` doesn't collide with any other file's fixtures).

- [ ] **Step 5: Commit**

```bash
git add test/integration/neon-cron-dispatch.integration.test.ts
git commit -m "test: cover due-schedule notification and claimable-job lookup against real Postgres"
```

---

### Task 8: Full verification and phase documentation

**Files:**
- Create: `docs/implementation/owner-platform-v1/PHASE-3-REPORT.md` (or append a `## P3.1` section if this file already exists by the time you implement this -- check first)
- Create: `docs/implementation/owner-platform-v1/PHASE-3-TEST-RESULTS.md` (same check)

- [ ] **Step 1: Check whether the phase report files already exist**

```bash
ls docs/implementation/owner-platform-v1/PHASE-3-REPORT.md docs/implementation/owner-platform-v1/PHASE-3-TEST-RESULTS.md 2>&1
```

If either exists, read it fully before touching it -- append a `## P3.1 -- scan scheduler dispatch` section rather than overwriting whatever another item already recorded there. If neither exists, create both fresh with just this section.

- [ ] **Step 2: Run the complete verification block**

```bash
corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test && corepack pnpm build
```

Expected: all green. Record the exact output (pass counts, durations) -- this is what goes in `PHASE-3-TEST-RESULTS.md`.

- [ ] **Step 3: Run the integration suite one more time as part of full verification**

```bash
corepack pnpm test:integration
```

Expected: PASS.

- [ ] **Step 4: Write `PHASE-3-REPORT.md`'s P3.1 section**

Include: what changed (list Tasks 1-7's files), the corrected stale-comment fix in `lib/workspace/rescan.ts` is **not** part of this plan's tasks -- flag it as a follow-up if you notice it's still stale after this lands, since Task 1-7 never touch that file. What's still NOT done from the Master Plan's full P3.1 wishlist (per-module checkpoint/resume, standing consent, budgets) and why (design doc's explicit scope cut). Exact verification commands and their pass counts from Steps 2-3. What requires hosted authorization before this actually runs on a schedule (`CRON_SECRET` set in the real environment, and confirming the cron actually fires post-deploy) -- not done by this plan, per the design doc's "what done means here."

- [ ] **Step 5: Commit**

```bash
git add docs/implementation/owner-platform-v1/PHASE-3-REPORT.md docs/implementation/owner-platform-v1/PHASE-3-TEST-RESULTS.md
git commit -m "docs(P3.1): record the scan scheduler dispatch phase report"
```
