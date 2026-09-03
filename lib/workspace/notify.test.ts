import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { localized } from "@/lib/domain";
import { hasNotificationSince, notifyWorkspace, workspaceHomeHref } from "./notify";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  members: [] as Row[],
  membersError: null as { message: string } | null,
  existing: [] as Row[],
  inserted: [] as Row[],
  insertError: null as { message: string } | null,
  slug: "kam-man-house" as string | null,
}));

function client(): SupabaseClient {
  const from = (table: string) => {
    let inserted: Row[] | null = null;
    const terminal = () => {
      if (table === "workspace_members") return { data: state.membersError ? null : state.members, error: state.membersError };
      if (table === "workspace_notifications") {
        if (inserted) {
          if (state.insertError) return { data: null, error: state.insertError };
          state.inserted.push(...inserted);
          return { data: null, error: null };
        }
        return { data: state.existing, error: null };
      }
      if (table === "workspaces") return { data: state.slug ? { slug: state.slug } : null, error: null };
      return { data: null, error: null };
    };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self,
      eq: self,
      not: self,
      gte: self,
      limit: self,
      insert: (rows: Row[]) => {
        inserted = rows;
        return Promise.resolve(terminal());
      },
      returns: () => Promise.resolve(terminal()),
      maybeSingle: () => Promise.resolve(terminal()),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(terminal()).then(resolve, reject),
    });
    return chain;
  };
  return { from } as unknown as SupabaseClient;
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
