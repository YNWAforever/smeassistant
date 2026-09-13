import { beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => {
    vi.clearAllMocks();
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
