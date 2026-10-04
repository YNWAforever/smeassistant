import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  factory: vi.fn(),
  inserted: [] as Array<Record<string, unknown>>,
  hasSince: vi.fn(),
  workspaceSlug: vi.fn(),
}));

vi.mock("@/lib/repositories/notifications", () => ({
  notificationRepository: () => mocks.factory(),
}));

import { sendDeliveryNotices } from "./delivery-notices";
import type { Usage } from "./usage";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const ACTION = "33333333-3333-4333-8333-333333333333";
const usage = (approvedDeliveries: number, allowance: number | null): Usage => ({
  period: "2026-10",
  approvedDeliveries,
  allowance,
  tier: allowance === null ? "paid" : "lite",
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inserted = [];
  mocks.hasSince.mockResolvedValue(false);
  mocks.workspaceSlug.mockResolvedValue("kam-man-house");
  mocks.factory.mockReturnValue({
    acceptedMemberIds: async () => ["user-1"],
    insert: async (rows: Array<Record<string, unknown>>) => {
      mocks.inserted.push(...rows);
      return rows.length;
    },
    hasSince: (...args: unknown[]) => mocks.hasSince(...args),
    workspaceSlug: (...args: unknown[]) => mocks.workspaceSlug(...args),
  });
});

describe("sendDeliveryNotices", () => {
  it.each([
    ["export", "Approved version exported", "已匯出批准版本"],
    ["copy", "Approved version copied", "已複製批准版本"],
    ["publish", "Approved reply published to Google", "已將核准回覆發佈到 Google"],
  ] as const)("%s: one delivery notice linking the action", async (kind, en, zh) => {
    await sendDeliveryNotices({ workspaceId: WORKSPACE, actionId: ACTION, kind, usage: usage(1, 3) });
    expect(mocks.inserted).toHaveLength(1);
    expect(mocks.inserted[0]).toMatchObject({
      kind: "delivery.exported",
      title: { en, "zh-HK": zh },
      body: { en: "1 of 3 approved deliveries used this period." },
      href: `/owner/kam-man-house/actions/${ACTION}`,
    });
  });

  it("adds the allowance notice once per period at the warning threshold", async () => {
    await sendDeliveryNotices({ workspaceId: WORKSPACE, actionId: ACTION, kind: "publish", usage: usage(2, 3) });
    expect(mocks.inserted.map((row) => row.kind)).toEqual(["delivery.exported", "usage.allowance_80"]);
    expect(mocks.inserted[1]).toMatchObject({
      title: { en: "1 approved delivery left this period" },
      href: "/owner/kam-man-house/settings/billing",
    });
    expect(mocks.hasSince).toHaveBeenCalledWith(WORKSPACE, "usage.allowance_80", "2026-10-01T00:00:00Z");

    mocks.inserted = [];
    mocks.hasSince.mockResolvedValue(true);
    await sendDeliveryNotices({ workspaceId: WORKSPACE, actionId: ACTION, kind: "publish", usage: usage(2, 3) });
    expect(mocks.inserted.map((row) => row.kind)).toEqual(["delivery.exported"]);
  });

  it("an unlimited allowance says how many deliveries this period and never warns", async () => {
    await sendDeliveryNotices({ workspaceId: WORKSPACE, actionId: ACTION, kind: "export", usage: usage(9, null) });
    expect(mocks.inserted).toHaveLength(1);
    expect(mocks.inserted[0]).toMatchObject({ body: { en: "9 approved deliveries this period." } });
  });

  it("never throws", async () => {
    mocks.factory.mockImplementation(() => {
      throw new Error("no database");
    });
    await expect(
      sendDeliveryNotices({ workspaceId: WORKSPACE, actionId: ACTION, kind: "publish", usage: usage(2, 3) }),
    ).resolves.toBeUndefined();
  });
});
