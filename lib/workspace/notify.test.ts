import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationRepository } from "./notify";
import { localized } from "@/lib/domain";
import { hasSinceWithRepository as hasNotificationSince, notifyWithRepository as notifyWorkspace, homeHrefWithRepository as workspaceHomeHref } from "./notify";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  members: [] as Row[],
  membersError: null as { message: string } | null,
  existing: [] as Row[],
  inserted: [] as Row[],
  insertError: null as { message: string } | null,
  slug: "kam-man-house" as string | null,
}));

function client(): NotificationRepository {
 return {
  async acceptedMemberIds(){if(state.membersError)throw new Error("members lookup failed");return state.members.map(row=>String(row.user_id));},
  async insert(rows,dedupe){if(state.insertError)throw new Error("notification insert failed");const fresh=dedupe?rows.filter(row=>!state.inserted.some(existing=>existing.id===row.id)):rows;state.inserted.push(...fresh.map(row=>({...row})));return fresh.length;},
  async hasSince(){return Boolean(state.existing.length);},
  async workspaceSlug(){return state.slug;},
 };
}

beforeEach(() => {
  state.members = [{ user_id: "u-owner" }, { user_id: "u-manager" }, { user_id: "u-owner" }];
  state.membersError = null;
  state.existing = [];
  state.inserted = [];
  state.insertError = null;
  state.slug = "kam-man-house";
});

const title = localized("Scan completed", "掃描完成");

describe("notifyWorkspace", () => {
  it("writes one row per accepted member (deduplicated) by default", async () => {
    const outcome = await notifyWorkspace(client(), { workspaceId: "ws-1", kind: "scan.completed", title, href: "/owner/kam-man-house" });
    expect(outcome).toEqual({ inserted: 2, error: null });
    expect(state.inserted.map((r) => r.user_id)).toEqual(["u-owner", "u-manager"]);
    expect(state.inserted[0]).toMatchObject({ workspace_id: "ws-1", kind: "scan.completed", title, body: null, href: "/owner/kam-man-house" });
  });

  it("targets an explicit recipient list when given", async () => {
    await notifyWorkspace(client(), { workspaceId: "ws-1", kind: "version.approved", title, userIds: ["u-x"] });
    expect(state.inserted.map((r) => r.user_id)).toEqual(["u-x"]);
  });

  it("never throws: a failed lookup or insert is logged and reported", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.insertError = { message: "boom" };
    expect(await notifyWorkspace(client(), { workspaceId: "ws-1", kind: "scan.failed", title })).toEqual({ inserted: 0, error: "notification insert failed" });
    state.insertError = null;
    state.membersError = { message: "boom" };
    expect(await notifyWorkspace(client(), { workspaceId: "ws-1", kind: "scan.failed", title })).toEqual({ inserted: 0, error: "members lookup failed" });
    spy.mockRestore();
  });

  it("inserts nothing for a workspace with no accepted members", async () => {
    state.members = [];
    expect(await notifyWorkspace(client(), { workspaceId: "ws-1", kind: "scan.failed", title })).toEqual({ inserted: 0, error: null });
  });
});

describe("hasNotificationSince / workspaceHomeHref", () => {
  it("reports an existing row of the kind in the period", async () => {
    expect(await hasNotificationSince(client(), "ws-1", "usage.allowance_80", "2026-09-01T00:00:00Z")).toBe(false);
    state.existing = [{ id: "n-1" }];
    expect(await hasNotificationSince(client(), "ws-1", "usage.allowance_80", "2026-09-01T00:00:00Z")).toBe(true);
  });

  it("builds the owner home href from the workspace slug", async () => {
    expect(await workspaceHomeHref(client(), "ws-1")).toBe("/owner/kam-man-house");
    state.slug = null;
    expect(await workspaceHomeHref(client(), "ws-1")).toBeNull();
  });
});


it("deduplicates the same terminal job per recipient after process recreation without resetting read state", async () => {
  const input = { workspaceId: "ws-1", kind: "scan.completed" as const, title, completionJobId: "job-1" };
  expect(await notifyWorkspace(client(), input)).toEqual({ inserted: 2, error: null });
  state.inserted[0]!.read_at = "2026-09-05T00:00:00Z";
  expect(await notifyWorkspace(client(), input)).toEqual({ inserted: 0, error: null });
  expect(state.inserted).toHaveLength(2);
  expect(state.inserted[0]!.read_at).toBe("2026-09-05T00:00:00Z");
  expect(state.inserted[0]!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  await notifyWorkspace(client(), { ...input, completionJobId: "job-2" });
  await notifyWorkspace(client(), { ...input, workspaceId: "ws-2" });
  await notifyWorkspace(client(), { ...input, kind: "scan.failed" });
  expect(new Set(state.inserted.map((row) => row.id)).size).toBe(8);
});
