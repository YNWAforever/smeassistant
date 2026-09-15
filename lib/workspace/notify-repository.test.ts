import { it, expect, vi } from "vitest";
import * as notifications from "./notify";
it("uses explicit notification repository with shared recipient dedupe", async () => {
  const insert = vi.fn(async (rows: unknown[]) => rows.length);
  const repo = {
    acceptedMemberIds: async () => ["one", "one", "two"],
    insert,
    hasSince: async () => false,
    workspaceSlug: async () => "shop",
  };
  expect(
    await notifications.notifyWithRepository(repo, {
      workspaceId: "w",
      kind: "version.approved",
      title: { en: "Approved", "zh-HK": "Approved", "zh-TW": "Approved" },
    }),
  ).toEqual({ inserted: 2, error: null });
  expect(insert.mock.calls[0][0]).toHaveLength(2);
  expect(await notifications.homeHrefWithRepository(repo, "w")).toBe(
    "/owner/shop",
  );
  expect(
    await notifications.hasSinceWithRepository(
      repo,
      "w",
      "version.approved",
      "2026-09-01Z",
    ),
  ).toBe(false);
});

it("accepts the schedule.due kind", async () => {
  const insert = vi.fn().mockResolvedValue(1);
  const repo = {
    acceptedMemberIds: vi.fn().mockResolvedValue(["user-1"]),
    insert,
    hasSince: vi.fn(),
    workspaceSlug: vi.fn(),
  };
  const outcome = await notifications.notifyWithRepository(repo, {
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
