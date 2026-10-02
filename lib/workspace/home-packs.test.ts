import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Membership } from "@/lib/auth";
import type { WorkspaceContext } from "@/lib/workspace/queries";

const mocks = vi.hoisted(() => ({
  packRepository: vi.fn(),
  openPack: vi.fn(),
  loadActionRows: vi.fn(),
  overviewsFor: vi.fn(),
}));
vi.mock("@/lib/repositories/packs", () => ({ packRepository: mocks.packRepository }));
vi.mock("@/lib/workspace/queries-pages", () => ({ loadActionRows: mocks.loadActionRows, overviewsFor: mocks.overviewsFor }));

import { loadHomeWorkPacks } from "./packs";

const ctx = {
  workspace: { id: "ws-1" },
  locations: [
    { id: "loc-1", name: "Yik Yam" },
    { id: "loc-2", name: "Tin Hau" },
  ],
  usage: { period: "2026-10", approvedDeliveries: 2, allowance: 3 },
} as unknown as WorkspaceContext;

function membership(overrides: Partial<Membership> = {}): Membership {
  return { workspaceId: "ws-1", workspaceSlug: "kam-man-house", userId: "u-1", email: "o@example.com", role: "owner", locationScope: null, ...overrides };
}

const PACK = { id: "pack-1", workspaceId: "ws-1", locationId: "loc-1", kind: "visibility_starter", createdAt: "2026-10-02T00:00:00Z", closedAt: null };

beforeEach(() => {
  vi.unstubAllEnvs();
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.packRepository.mockReturnValue({ openPack: mocks.openPack });
});

describe("loadHomeWorkPacks", () => {
  it("returns undefined and touches no repository, row query or SQL when the flag is off", async () => {
    for (const value of [undefined, "", "TRUE", "1", "false"]) {
      if (value === undefined) vi.unstubAllEnvs();
      else vi.stubEnv("WORK_PACKS_ENABLED", value);
      expect(await loadHomeWorkPacks(ctx, membership(), { id: "loc-1", isAll: false })).toBeUndefined();
      expect(await loadHomeWorkPacks(ctx, membership(), { id: null, isAll: true })).toBeUndefined();
    }
    expect(mocks.packRepository).not.toHaveBeenCalled();
    expect(mocks.openPack).not.toHaveBeenCalled();
    expect(mocks.loadActionRows).not.toHaveBeenCalled();
    expect(mocks.overviewsFor).not.toHaveBeenCalled();
  });

  it("with the flag on and no open pack, returns the card data with usage and no pack", async () => {
    vi.stubEnv("WORK_PACKS_ENABLED", "true");
    mocks.openPack.mockResolvedValue(null);
    const result = await loadHomeWorkPacks(ctx, membership(), { id: "loc-1", isAll: false });
    expect(mocks.openPack).toHaveBeenCalledWith("ws-1", "loc-1");
    expect(result).toEqual({
      enabled: true,
      card: {
        workspaceId: "ws-1",
        workspaceSlug: "kam-man-house",
        role: "owner",
        location: { id: "loc-1", isAll: false },
        inScope: true,
        usage: { approvedDeliveries: 2, allowance: 3 },
        initialPack: null,
      },
      earlierDrafts: { workspaceId: "ws-1", role: "owner" },
    });
  });

  it("reads the open pack overview when one exists", async () => {
    vi.stubEnv("WORK_PACKS_ENABLED", "true");
    mocks.openPack.mockResolvedValue({ pack: PACK, itemRows: [{ templateKey: "review-response", position: 1, actionId: "act-1" }] });
    mocks.loadActionRows.mockResolvedValue([{ id: "act-1" }]);
    mocks.overviewsFor.mockResolvedValue([{ id: "act-1", actionState: "recommended" }]);
    const result = await loadHomeWorkPacks(ctx, membership(), { id: "loc-1", isAll: false });
    expect(mocks.loadActionRows).toHaveBeenCalledWith("ws-1", { ids: ["act-1"] });
    expect(result?.card.initialPack?.pack.id).toBe("pack-1");
    expect(result?.card.initialPack?.items).toHaveLength(1);
  });

  it("marks a location-scoped manager out of scope for a workspace-wide pack, and in scope for their own location", async () => {
    vi.stubEnv("WORK_PACKS_ENABLED", "true");
    mocks.openPack.mockResolvedValue(null);
    const scoped = membership({ role: "manager", locationScope: ["loc-1"] });
    expect((await loadHomeWorkPacks(ctx, scoped, { id: null, isAll: false }))?.card.inScope).toBe(false);
    expect((await loadHomeWorkPacks(ctx, scoped, { id: "loc-1", isAll: false }))?.card.inScope).toBe(true);
    expect((await loadHomeWorkPacks(ctx, scoped, { id: "loc-2", isAll: false }))?.card.inScope).toBe(false);
    expect((await loadHomeWorkPacks(ctx, membership({ role: "manager" }), { id: null, isAll: false }))?.card.inScope).toBe(true);
  });

  it("for a multi-location Home lists only the open packs of locations the caller can read, with no start location", async () => {
    vi.stubEnv("WORK_PACKS_ENABLED", "true");
    mocks.openPack.mockImplementation(async (_ws: string, locationId: string | null) =>
      locationId === "loc-1" || locationId === "loc-2" ? { pack: { ...PACK, id: `pack-${locationId}`, locationId }, itemRows: [{ templateKey: "review-response", position: 1, actionId: "act-1" }] } : null,
    );
    mocks.loadActionRows.mockResolvedValue([{ id: "act-1" }]);
    mocks.overviewsFor.mockResolvedValue([{ id: "act-1", actionState: "recommended" }]);
    const scoped = membership({ role: "manager", locationScope: ["loc-1"] });
    const result = await loadHomeWorkPacks(ctx, scoped, { id: null, isAll: true });
    expect(result?.card.location).toEqual({ id: null, isAll: true });
    expect(result?.card.initialPack).toBeNull();
    expect(result?.card.locationPacks?.map((entry) => entry.name)).toEqual(["Yik Yam"]);
    // loc-2 is outside this manager's scope, so it is never read.
    expect(mocks.openPack).not.toHaveBeenCalledWith("ws-1", "loc-2");
  });

  it("treats a failed read as no open pack rather than failing Home", async () => {
    vi.stubEnv("WORK_PACKS_ENABLED", "true");
    mocks.openPack.mockRejectedValue(new Error("pack_read_failed"));
    const result = await loadHomeWorkPacks(ctx, membership(), { id: "loc-1", isAll: false });
    expect(result?.card.initialPack).toBeNull();
  });
});
