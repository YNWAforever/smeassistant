import { describe, expect, it } from "vitest";

import type { WorkspaceContext } from "@/lib/workspace/queries";
import {
  accountInitials,
  avatarInitial,
  buildShellWorkspace,
  defaultLocationSlug,
  locationWhitelist,
  resolveLocationSlug,
  roleLabel,
  usagePercent,
} from "@/lib/workspace/shell";
import { demoShellWorkspace, demoShellWorkspaceFor } from "@/lib/demo-data";

const context: WorkspaceContext = {
  workspace: {
    id: "ws-1",
    slug: "kam-man-house",
    name: "錦汶館",
    market: "hk",
    tier: "lite",
    timezone: "Asia/Hong_Kong",
    isDemo: false,
    instagramHandle: null,
    industry: null,
    district: null,
  },
  locations: [
    { id: "loc-2", slug: "tin-hau", name: "Tin Hau", address: null, district: null, isPrimary: false, placeId: null },
    { id: "loc-1", slug: "yik-yam", name: "Yik Yam Street", address: null, district: null, isPrimary: true, placeId: null },
  ],
  usage: { period: "2026-09", approvedDeliveries: 5, allowance: 12 },
  unreadNotifications: 3,
  membership: { workspaceId: "ws-1", workspaceSlug: "kam-man-house", userId: "u", email: "willy@example.com", role: "manager", locationScope: null },
  account: { name: "willy", email: "willy@example.com" },
};

describe("shell helpers", () => {
  it("localises role labels in all three locales", () => {
    expect(roleLabel("owner", "en")).toBe("Owner");
    expect(roleLabel("owner", "zh-HK")).toBe("店主");
    expect(roleLabel("viewer", "zh-TW")).toBe("檢視者");
  });

  it("takes the first user-perceived character as the avatar initial", () => {
    expect(avatarInitial("錦汶館")).toBe("錦");
    expect(avatarInitial("  kam man house")).toBe("K");
    expect(avatarInitial("")).toBe("?");
  });

  it("builds two-letter initials for a two-word name and one glyph otherwise", () => {
    expect(accountInitials("Willy Lai")).toBe("WL");
    expect(accountInitials("willy")).toBe("W");
    expect(accountInitials("錦汶館")).toBe("錦");
  });

  it("whitelists 'all' plus the workspace's own location slugs, falling back on anything else", () => {
    const locations = [{ slug: "yik-yam" }, { slug: "tin-hau" }];
    expect(locationWhitelist(locations)).toEqual(["all", "yik-yam", "tin-hau"]);
    expect(resolveLocationSlug("tin-hau", locations, "yik-yam")).toBe("tin-hau");
    expect(resolveLocationSlug("all", locations, "yik-yam")).toBe("all");
    expect(resolveLocationSlug("somewhere-else", locations, "yik-yam")).toBe("yik-yam");
    expect(resolveLocationSlug(null, locations, "yik-yam")).toBe("yik-yam");
  });

  it("defaults to the primary location, then the first, then 'all'", () => {
    expect(defaultLocationSlug(context.locations)).toBe("yik-yam");
    expect(defaultLocationSlug([{ slug: "only" }])).toBe("only");
    expect(defaultLocationSlug([])).toBe("all");
  });

  it("renders usage as a percentage only when an allowance exists", () => {
    expect(usagePercent(5, 12)).toBe(42);
    expect(usagePercent(20, 12)).toBe(100);
    expect(usagePercent(5, null)).toBeNull();
    expect(usagePercent(0, 0)).toBeNull();
  });
});

describe("buildShellWorkspace", () => {
  it("maps a loaded context onto the shell contract without any demo literal", () => {
    const shell = buildShellWorkspace(context, "zh-HK", { urgentActions: 2 });
    expect(shell).toEqual({
      slug: "kam-man-house",
      name: "錦汶館",
      avatarInitial: "錦",
      locations: [
        { slug: "tin-hau", name: "Tin Hau" },
        { slug: "yik-yam", name: "Yik Yam Street" },
      ],
      defaultLocationSlug: "yik-yam",
      usage: { approvedDeliveries: 5, allowance: 12 },
      account: { name: "willy", email: "willy@example.com", roleLabel: "經理" },
      unreadNotifications: 3,
      demo: false,
      urgentActions: 2,
      assistant: { workspaceId: "ws-1", locationId: "loc-1" },
    });
  });

  it("fills the assistant ids from the workspace id and the default (primary) location id", () => {
    expect(buildShellWorkspace(context, "en").assistant).toEqual({ workspaceId: "ws-1", locationId: "loc-1" });
    const firstOnly = buildShellWorkspace({ ...context, locations: [{ ...context.locations[0], isPrimary: false }] }, "en");
    expect(firstOnly.assistant).toEqual({ workspaceId: "ws-1", locationId: "loc-2" });
    expect(buildShellWorkspace({ ...context, locations: [] }, "en").assistant).toEqual({ workspaceId: "ws-1" });
    expect(demoShellWorkspace.assistant).toBeUndefined();
  });

  it("marks demo workspaces so the shell shows the DemoBadge only there", () => {
    const shell = buildShellWorkspace({ ...context, workspace: { ...context.workspace, isDemo: true } }, "en");
    expect(shell.demo).toBe(true);
    expect(shell.account.roleLabel).toBe("Manager");
    expect("urgentActions" in shell).toBe(false);
  });
});

describe("demoShellWorkspace", () => {
  it("keeps the fixed Kam Man House sample the prototype pages render", () => {
    expect(demoShellWorkspace).toMatchObject({
      slug: "kam-man-house",
      name: "錦汶館",
      avatarInitial: "錦",
      defaultLocationSlug: "yik-yam",
      usage: { approvedDeliveries: 5, allowance: 12 },
      unreadNotifications: 3,
      demo: true,
    });
    expect(demoShellWorkspace.locations.map((l) => l.slug)).toEqual(["yik-yam", "tin-hau"]);
    expect(demoShellWorkspace.account.name).toBe("Willy Lai");
  });

  it("localises the sample's location names and role label per locale", () => {
    expect(demoShellWorkspaceFor("en").locations.map((l) => l.name)).toEqual(["Yik Yam Street", "Tin Hau"]);
    expect(demoShellWorkspaceFor("zh-HK").locations.map((l) => l.name)).toEqual(["奕蔭街", "天后"]);
    expect(demoShellWorkspaceFor("zh-HK").account.roleLabel).toBe("店主");
    expect(demoShellWorkspaceFor("en").account.roleLabel).toBe("Owner");
  });
});
