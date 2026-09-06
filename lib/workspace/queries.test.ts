import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Membership } from "@/lib/auth";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  memberships: [] as Membership[], workspaces: [] as Row[], locations: [] as Row[],
  usage: null as Row | null, unread: 0, urgent: 0,
  snapshots: {} as Record<string, Row | undefined>, reports: [] as Row[],
  workspaceError: null as null | { code: string; message: string },
}));
const repository = vi.hoisted(() => ({
  workspaces: vi.fn(), locations: vi.fn(), usage: vi.fn(),
  unreadNotifications: vi.fn(), urgentActions: vi.fn(), latestSnapshot: vi.fn(), latestReport: vi.fn(),
}));
vi.mock("@/lib/repositories/workspace-read", () => ({ workspaceReadRepository: () => repository }));

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
  state.unread = 0;
  state.urgent = 0;
  state.snapshots = {};
  state.reports = [];
  state.workspaceError = null;
  vi.clearAllMocks();
  repository.workspaces.mockImplementation(async () => {
    if (state.workspaceError) throw new Error("workspace persistence failed");
    return state.workspaces;
  });
  repository.locations.mockImplementation(async () => state.locations);
  repository.usage.mockImplementation(async (_id, period, allowance) => state.usage ?? { period, approved_deliveries: 0, allowance });
  repository.unreadNotifications.mockImplementation(async () => state.unread);
  repository.urgentActions.mockImplementation(async () => state.urgent);
  repository.latestSnapshot.mockImplementation(async (_workspaceId, locationId) => state.snapshots[locationId] ?? null);
  repository.latestReport.mockImplementation(async () => state.reports[0] ?? null);
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

    expect(repository.locations).toHaveBeenCalledWith(["ws-1"]);
    expect(repository.unreadNotifications).toHaveBeenCalledWith("ws-1", "user-1");
  });

  it("creates the current period's usage row with the tier allowance when it is missing", async () => {
    state.workspaces = [workspaceRow];
    const context = await loadWorkspaceContext(membership);

    expect(repository.usage).toHaveBeenCalledWith("ws-1", expect.stringMatching(/^\d{4}-\d{2}$/), 3);
    expect(context.usage).toMatchObject({ approvedDeliveries: 0, allowance: 3 });
  });

  it("copies a null allowance for the paid tier (unlimited)", async () => {
    state.workspaces = [{ ...workspaceRow, tier: "paid", market: "TW" }];
    const context = await loadWorkspaceContext(membership);
    expect(context.workspace.tier).toBe("paid");
    expect(context.workspace.market).toBe("tw");
    expect(repository.usage).toHaveBeenCalledWith("ws-1", expect.any(String), null);
    expect(context.usage.allowance).toBeNull();
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
    expect(repository.workspaces).not.toHaveBeenCalled();
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

    expect(repository.latestSnapshot).toHaveBeenCalledWith("ws-1", "loc-1");
    expect(repository.urgentActions).toHaveBeenCalledWith("ws-1", "loc-1");
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
    expect(repository.latestReport).toHaveBeenCalledWith("ws-1");
  });

  it("returns null when the workspace has no attached job", async () => {
    await expect(latestWorkspaceReport("ws-1")).resolves.toBeNull();
  });
});
