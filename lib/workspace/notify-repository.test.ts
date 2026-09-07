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
