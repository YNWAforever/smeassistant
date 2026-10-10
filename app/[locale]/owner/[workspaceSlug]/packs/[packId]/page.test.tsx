import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadOwnerPage: vi.fn(),
  packScope: vi.fn(),
  getPack: vi.fn(),
  loadPackOverview: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/workspace/page-context", () => ({
  loadOwnerPage: mocks.loadOwnerPage,
  ownerPageMetadata: vi.fn(),
  inScopeFor: (membership: { locationScope: string[] | null }, locationId: string | null) =>
    locationId === null || membership.locationScope === null || membership.locationScope.includes(locationId),
}));
vi.mock("@/lib/repositories/packs", () => ({ packRepository: () => ({ packScope: mocks.packScope, getPack: mocks.getPack }) }));
vi.mock("@/lib/workspace/packs", () => ({ loadPackOverview: mocks.loadPackOverview }));
vi.mock("@/components/workspace/pack-view", () => ({ PackView: () => null, PackUnavailable: () => null }));

import { PackUnavailable, PackView } from "@/components/workspace/pack-view";
import Page from "./page";

const PACK_ID = "11111111-1111-4111-8111-111111111111";
const props = (packId = PACK_ID) => ({ params: Promise.resolve({ locale: "en", workspaceSlug: "kam-man-house", packId }) });

describe("pack page", () => {
  beforeEach(() => {
    vi.stubEnv("WORK_PACKS_ENABLED", "true");
    mocks.loadOwnerPage.mockResolvedValue({
      locale: "en",
      workspaceSlug: "kam-man-house",
      membership: { workspaceId: "ws-1", role: "owner", locationScope: null },
      ctx: { workspace: { id: "ws-1" }, locations: [{ id: "loc-1", name: "Yik Yam" }] },
    });
    mocks.packScope.mockResolvedValue({ workspaceId: "ws-1", locationId: "loc-1" });
    mocks.getPack.mockResolvedValue({ pack: { id: PACK_ID }, itemRows: [] });
    mocks.loadPackOverview.mockResolvedValue({ id: PACK_ID, items: [] });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it("renders the pack when every read succeeds", async () => {
    const element = await Page(props());
    expect(element.type).toBe(PackView);
  });

  it("is a missing page for a pack that does not exist or belongs to another workspace", async () => {
    mocks.packScope.mockResolvedValueOnce(null);
    await expect(Page(props())).rejects.toThrow("NEXT_NOT_FOUND");
    mocks.packScope.mockResolvedValueOnce({ workspaceId: "ws-other", locationId: null });
    await expect(Page(props())).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("is a missing page for an id that is not a pack id, without reading the database", async () => {
    await expect(Page(props("not-a-uuid"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.packScope).not.toHaveBeenCalled();
  });

  it("is a missing page for a scoped manager outside the pack's location", async () => {
    mocks.loadOwnerPage.mockResolvedValueOnce({
      locale: "en",
      workspaceSlug: "kam-man-house",
      membership: { workspaceId: "ws-1", role: "manager", locationScope: ["loc-2"] },
      ctx: { workspace: { id: "ws-1" }, locations: [] },
    });
    await expect(Page(props())).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it.each([
    ["the scope read", () => mocks.packScope.mockRejectedValueOnce(new Error("pack_read_failed"))],
    ["the pack read", () => mocks.getPack.mockRejectedValueOnce(new Error("pack_read_failed"))],
    ["the overview", () => mocks.loadPackOverview.mockRejectedValueOnce(new Error("pack_item_missing"))],
  ])("says the pack is temporarily unavailable when %s fails, instead of claiming it does not exist", async (_what, fail) => {
    fail();
    const element = await Page(props());
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(element.type).toBe(PackUnavailable);
    expect(element.props).toMatchObject({ locale: "en", workspaceSlug: "kam-man-house" });
  });
});
