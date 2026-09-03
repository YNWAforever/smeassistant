import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Membership } from "@/lib/auth";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

/**
 * Mocking style follows lib/report/load-report.test.ts: one chainable query
 * per `from(table)` whose terminal resolves from `state`, plus a log of every
 * call so the tests can assert the exact filters that reached PostgREST.
 */
const state = vi.hoisted(() => ({
  memberships: [] as Membership[],
  workspaces: [] as Row[],
  locations: [] as Row[],
  usage: null as Row | null,
  usageInsertError: null as null | { code: string; message: string },
  unread: 0,
  urgent: 0,
  snapshots: {} as Record<string, Row | undefined>,
  reports: [] as Row[],
  workspaceError: null as null | { code: string; message: string },
  calls: [] as Array<{ table: string; op: string; args: unknown[] }>,
  inserts: [] as Array<{ table: string; values: Row }>,
}));

function queryFor(table: string) {
  const filters: Array<{ column: string; value: unknown }> = [];
  let head = false;
  let inserting = false;
  const result = () => {
    if (table === "workspaces") {
      if (state.workspaceError) return { data: null, error: state.workspaceError, count: null };
      const id = filters.find((f) => f.column === "id")?.value;
      const rows = id ? state.workspaces.filter((row) => row.id === id) : state.workspaces;
      return { data: rows, error: null, count: null };
    }
    if (table === "locations") return { data: state.locations, error: null, count: null };
    if (table === "workspace_usage") {
      if (inserting) return { data: null, error: state.usageInsertError, count: null };
      return { data: state.usage ? [state.usage] : [], error: null, count: null };
    }
    if (table === "workspace_notifications") return { data: null, error: null, count: state.unread };
    if (table === "actions") return { data: null, error: null, count: state.urgent };
    if (table === "scan_snapshots") {
      const locationId = String(filters.find((f) => f.column === "location_id")?.value);
      const row = state.snapshots[locationId];
      return { data: row ? [row] : [], error: null, count: null };
    }
    if (table === "audit_jobs") return { data: state.reports, error: null, count: null };
    throw new Error(`unexpected table ${table}`);
  };
  const single = () => {
    const { data, error } = result();
    const rows = Array.isArray(data) ? data : [];
    return { data: rows[0] ?? null, error };
  };
  const query = {
    select(columns: string, options?: { head?: boolean; count?: string }) {
      head = Boolean(options?.head);
      state.calls.push({ table, op: "select", args: [columns, options] });
      return query;
    },
    eq(column: string, value: unknown) {
      filters.push({ column, value });
      state.calls.push({ table, op: "eq", args: [column, value] });
      return query;
    },
    in(column: string, value: unknown) {
      state.calls.push({ table, op: "in", args: [column, value] });
      return query;
    },
    is(column: string, value: unknown) {
      state.calls.push({ table, op: "is", args: [column, value] });
      return query;
    },
    not(column: string, operator: string, value: unknown) {
      state.calls.push({ table, op: "not", args: [column, operator, value] });
      return query;
    },
    order(column: string, options?: unknown) {
      state.calls.push({ table, op: "order", args: [column, options] });
      return query;
    },
    limit(value: number) {
      state.calls.push({ table, op: "limit", args: [value] });
      return query;
    },
    returns() {
      return query;
    },
    insert(values: Row) {
      inserting = true;
      state.inserts.push({ table, values });
      return query;
    },
    maybeSingle: vi.fn(async () => single()),
    single: vi.fn(async () => single()),
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      const value = head ? { ...result(), data: null } : result();
      return Promise.resolve(value).then(resolve, reject);
    },
  };
  return query;
}

vi.mock("@/lib/supabase/admin", () => ({
  supabaseServer: vi.fn(() => ({ from: (table: string) => queryFor(table) })),
}));

vi.mock("@/lib/auth", () => ({
  listMemberships: vi.fn(async () => state.memberships),
}));

vi.mock("@/lib/workspace/entitlement", () => ({
  deliveryAllowanceForTier: vi.fn((tier: string) => (tier === "paid" ? null : 3)),
}));

import {
  accountNameFromEmail,
  currentPeriod,
  latestWorkspaceReport,
  listWorkspaceCards,
  loadWorkspaceContext,
} from "./queries";

const membership: Membership = {
  workspaceId: "ws-1",
  workspaceSlug: "kam-man-house",
  userId: "user-1",
  email: "owner@example.com",
  role: "owner",
  locationScope: null,
};

const workspaceRow = {
  id: "ws-1",
  slug: "kam-man-house",
  business_name: "錦汶館",
  market: "hk",
  tier: "lite",
  timezone: "Asia/Hong_Kong",
  is_demo: false,
  instagram_handle: null,
  industry: "F&B",
  district: "Happy Valley",
};

beforeEach(() => {
  state.memberships = [];
  state.workspaces = [];
  state.locations = [];
  state.usage = null;
  state.usageInsertError = null;
  state.unread = 0;
  state.urgent = 0;
  state.snapshots = {};
  state.reports = [];
  state.workspaceError = null;
  state.calls = [];
  state.inserts = [];
});

describe("currentPeriod", () => {
  it("formats YYYY-MM in the workspace timezone, not UTC", () => {
    // 2026-08-31T20:00Z is already 1 September in Hong Kong.
    const now = new Date("2026-08-31T20:00:00.000Z");
    expect(currentPeriod("Asia/Hong_Kong", now)).toBe("2026-09");
    expect(currentPeriod("UTC", now)).toBe("2026-08");
  });

  it("falls back to UTC for an unknown timezone instead of throwing", () => {
    expect(currentPeriod("Not/AZone", new Date("2026-03-15T12:00:00.000Z"))).toBe("2026-03");
  });
});

describe("accountNameFromEmail", () => {
  it("uses the local part of the email as the display name", () => {
    expect(accountNameFromEmail("willy.lai@example.com")).toBe("willy.lai");
    expect(accountNameFromEmail("nobody")).toBe("nobody");
  });
});

describe("loadWorkspaceContext", () => {
  it("shapes the workspace, orders locations, reads usage and unread count", async () => {
    state.workspaces = [workspaceRow];
    state.locations = [
      { id: "loc-1", workspace_id: "ws-1", slug: "yik-yam", name: "Yik Yam Street", address: "8 Yik Yam Street", district: null, is_primary: true },
      { id: "loc-2", workspace_id: "ws-1", slug: "tin-hau", name: "Tin Hau", address: null, district: "Eastern", is_primary: false },
    ];
    state.usage = { period: "2026-09", approved_deliveries: 5, allowance: 12 };
    state.unread = 3;

    const context = await loadWorkspaceContext(membership);

    expect(context.workspace).toEqual({
      id: "ws-1",
      slug: "kam-man-house",
      name: "錦汶館",
      market: "hk",
      tier: "lite",
      timezone: "Asia/Hong_Kong",
      isDemo: false,
      instagramHandle: null,
      industry: "F&B",
      district: "Happy Valley",
    });
    expect(context.locations.map((l) => l.slug)).toEqual(["yik-yam", "tin-hau"]);
    expect(context.locations[0]).toMatchObject({ isPrimary: true, address: "8 Yik Yam Street" });
    expect(context.usage).toEqual({ period: "2026-09", approvedDeliveries: 5, allowance: 12 });
    expect(context.unreadNotifications).toBe(3);
    expect(context.account).toEqual({ name: "owner", email: "owner@example.com" });
    expect(context.membership).toBe(membership);

    const locationOrder = state.calls.filter((c) => c.table === "locations" && c.op === "order").map((c) => c.args[0]);
    expect(locationOrder).toEqual(["is_primary", "name"]);
    const notificationFilters = state.calls.filter((c) => c.table === "workspace_notifications" && c.op !== "select");
    expect(notificationFilters).toEqual([
      { table: "workspace_notifications", op: "eq", args: ["workspace_id", "ws-1"] },
      { table: "workspace_notifications", op: "eq", args: ["user_id", "user-1"] },
      { table: "workspace_notifications", op: "is", args: ["read_at", null] },
    ]);
    expect(state.inserts).toEqual([]);
  });

  it("creates the current period's usage row with the tier allowance when it is missing", async () => {
    state.workspaces = [workspaceRow];
    const context = await loadWorkspaceContext(membership);

    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      table: "workspace_usage",
      values: { workspace_id: "ws-1", allowance: 3 },
    });
    expect(String(state.inserts[0].values.period)).toMatch(/^\d{4}-\d{2}$/);
    expect(context.usage).toMatchObject({ approvedDeliveries: 0, allowance: 3 });
  });

  it("copies a null allowance for the paid tier (unlimited)", async () => {
    state.workspaces = [{ ...workspaceRow, tier: "paid", market: "TW" }];
    const context = await loadWorkspaceContext(membership);
    expect(context.workspace.tier).toBe("paid");
    expect(context.workspace.market).toBe("tw");
    expect(state.inserts[0].values.allowance).toBeNull();
    expect(context.usage.allowance).toBeNull();
  });

  it("tolerates losing the usage insert race (duplicate key) and re-reads", async () => {
    state.workspaces = [workspaceRow];
    state.usageInsertError = { code: "23505", message: "duplicate key" };
    await expect(loadWorkspaceContext(membership)).resolves.toMatchObject({ usage: { approvedDeliveries: 0 } });
  });

  it("throws instead of rendering a blank shell when the workspace lookup fails", async () => {
    state.workspaceError = { code: "XX000", message: "boom" };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(loadWorkspaceContext(membership)).rejects.toThrow("Unable to load workspace");
    error.mockRestore();
  });
});

describe("listWorkspaceCards", () => {
  it("returns nothing without memberships and never touches the database", async () => {
    await expect(listWorkspaceCards("user-1")).resolves.toEqual([]);
    expect(state.calls).toEqual([]);
  });

  it("joins each membership to its workspace, locations, latest snapshot and urgent count", async () => {
    state.memberships = [membership, { ...membership, workspaceId: "ws-2", workspaceSlug: "other", role: "viewer" }];
    state.workspaces = [workspaceRow, { ...workspaceRow, id: "ws-2", slug: "other", business_name: "Other" }];
    state.locations = [
      { id: "loc-1", workspace_id: "ws-1", slug: "yik-yam", name: "Yik Yam Street", address: null, district: null, is_primary: true },
      { id: "loc-9", workspace_id: "ws-2", slug: "main", name: "Main", address: null, district: null, is_primary: true },
    ];
    state.snapshots = { "loc-1": { overall_score: "62", coverage: 0.78, observed_at: "2026-08-25T01:42:00.000Z" } };
    state.urgent = 1;

    const cards = await listWorkspaceCards("user-1");

    expect(cards).toHaveLength(2);
    expect(cards[0].workspace.slug).toBe("kam-man-house");
    expect(cards[0].role).toBe("owner");
    expect(cards[0].locations).toEqual([
      expect.objectContaining({ slug: "yik-yam", latestScore: 62, latestCoverage: 0.78, urgentActions: 1, lastScanAt: "2026-08-25T01:42:00.000Z" }),
    ]);
    expect(cards[1].role).toBe("viewer");
    expect(cards[1].locations[0]).toMatchObject({ slug: "main", latestScore: null, latestCoverage: null, lastScanAt: null });

    const snapshotCalls = state.calls.filter((c) => c.table === "scan_snapshots");
    expect(snapshotCalls).toContainEqual({ table: "scan_snapshots", op: "order", args: ["observed_at", { ascending: false }] });
    expect(snapshotCalls).toContainEqual({ table: "scan_snapshots", op: "limit", args: [1] });
    const actionFilters = state.calls.filter((c) => c.table === "actions" && c.op !== "select");
    expect(actionFilters).toContainEqual({ table: "actions", op: "eq", args: ["priority", "urgent"] });
    expect(actionFilters).toContainEqual({
      table: "actions",
      op: "not",
      args: ["action_state", "in", "(completed,dismissed,cancelled,expired)"],
    });
    expect(actionFilters).toContainEqual({ table: "actions", op: "eq", args: ["location_id", "loc-1"] });
  });

  it("skips a membership whose workspace row is missing rather than inventing one", async () => {
    state.memberships = [membership];
    state.workspaces = [];
    await expect(listWorkspaceCards("user-1")).resolves.toEqual([]);
  });
});

describe("latestWorkspaceReport", () => {
  it("returns the newest attached job's share slug", async () => {
    state.reports = [{ share_slug: "kam-man-house-abc", created_at: "2026-08-25T00:00:00.000Z", status: "done" }];
    await expect(latestWorkspaceReport("ws-1")).resolves.toEqual({
      shareSlug: "kam-man-house-abc",
      createdAt: "2026-08-25T00:00:00.000Z",
      status: "done",
    });
    expect(state.calls).toContainEqual({ table: "audit_jobs", op: "order", args: ["created_at", { ascending: false }] });
  });

  it("returns null when the workspace has no attached job", async () => {
    await expect(latestWorkspaceReport("ws-1")).resolves.toBeNull();
  });
});
