import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyDueSchedules } from "./notify-due-schedules";

const { notifyWithRepository, workspaceHref, dueSchedules, advanceSchedule, clientQuery } = vi.hoisted(() => ({
  notifyWithRepository: vi.fn(),
  workspaceHref: vi.fn(),
  dueSchedules: vi.fn(),
  advanceSchedule: vi.fn().mockResolvedValue(undefined),
  clientQuery: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/workspace/notify", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace/notify")>()),
  notifyWithRepository,
}));
vi.mock("@/lib/workspace/post-process", () => ({ workspaceHref }));
vi.mock("@/lib/repositories/scheduler", () => ({ schedulerRepository: () => ({ dueSchedules, advanceSchedule, claimableJobIds: vi.fn() }) }));
vi.mock("@/lib/repositories/notifications", () => ({ notificationRepository: () => ({}) }));
// The mocked client needs a `query` method now: notifyDueSchedules issues
// real SAVEPOINT/RELEASE/ROLLBACK TO SAVEPOINT calls on it per schedule.
vi.mock("@/lib/db/transaction", () => ({ withTransaction: (run: (client: unknown) => Promise<unknown>) => run({ query: clientQuery }) }));

function schedule(overrides: Partial<{ id: string; workspaceId: string | null; anniversaryDay: number; tier: string | null; notifyMonthlyDigest: boolean | null }> = {}) {
  return { id: "sched-1", workspaceId: "ws-1", anniversaryDay: 15, tier: "paid", notifyMonthlyDigest: true, ...overrides };
}

describe("notifyDueSchedules", () => {
  // vi.hoisted mocks aren't cleared between cases by this project's vitest
  // config, and several assertions below check `not.toHaveBeenCalled()` --
  // without this, an earlier case's calls accumulate and falsely fail a
  // later case (matches the existing pattern in lib/workspace/claim.test.ts).
  beforeEach(() => {
    vi.clearAllMocks();
    advanceSchedule.mockResolvedValue(undefined);
    clientQuery.mockResolvedValue(undefined);
  });

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
    expect(advanceSchedule).toHaveBeenCalledWith("sched-1", expect.any(String));
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

  it("aggregates due/notified correctly across more than one schedule in the same tick", async () => {
    dueSchedules.mockResolvedValue([schedule({ id: "sched-1" }), schedule({ id: "sched-2", tier: "lite" })]);
    workspaceHref.mockResolvedValue("/owner/kam-man-house");
    notifyWithRepository.mockResolvedValue({ inserted: 1, error: null });

    const result = await notifyDueSchedules("2026-09-13T00:00:00.000Z");

    expect(result).toEqual({ due: 2, notified: 1 });
    expect(advanceSchedule).toHaveBeenCalledWith("sched-1", expect.any(String));
    expect(advanceSchedule).toHaveBeenCalledWith("sched-2", expect.any(String));
    expect(notifyWithRepository).toHaveBeenCalledTimes(1);
  });

  it("rolls back only the failing schedule's savepoint and still processes the next one", async () => {
    dueSchedules.mockResolvedValue([schedule({ id: "sched-1" }), schedule({ id: "sched-2" })]);
    advanceSchedule.mockRejectedValueOnce(new Error("transient db error")).mockResolvedValueOnce(undefined);
    workspaceHref.mockResolvedValue("/owner/kam-man-house");
    notifyWithRepository.mockResolvedValue({ inserted: 1, error: null });

    const result = await notifyDueSchedules("2026-09-13T00:00:00.000Z");

    // sched-1 failed before its notify step ran; sched-2 still succeeds fully.
    expect(result).toEqual({ due: 2, notified: 1 });
    expect(advanceSchedule).toHaveBeenCalledTimes(2);
    expect(notifyWithRepository).toHaveBeenCalledTimes(1);
    expect(notifyWithRepository).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ workspaceId: "ws-1" }));
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK TO SAVEPOINT notify_due_schedule");
  });
});
