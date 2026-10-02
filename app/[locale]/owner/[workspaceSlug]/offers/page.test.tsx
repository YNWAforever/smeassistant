import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadOwnerPage: vi.fn(), list: vi.fn(), listAssets: vi.fn(), notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/workspace/page-context", () => ({ loadOwnerPage: mocks.loadOwnerPage, ownerPageMetadata: vi.fn() }));
vi.mock("@/lib/repositories/offers", () => ({ offerRepository: () => ({ list: mocks.list }) }));
vi.mock("@/lib/workspace/assets", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), listAssets: mocks.listAssets }));
vi.mock("@/components/workspace/offers-view", () => ({ OffersView: () => null }));

import Page from "./page";

const props = { params: Promise.resolve({ locale: "en", workspaceSlug: "kam-man-house" }) };
const LOCATIONS = [
  { id: "loc-1", slug: "yik-yam", name: "Yik Yam" },
  { id: "loc-2", slug: "tin-hau", name: "Tin Hau" },
];

function offer(id: string, locationId: string | null) {
  return { id, locationId };
}
function asset(id: string, location_id: string | null, overrides: Record<string, unknown> = {}) {
  return { id, filename: `${id}.jpg`, location_id, rights_status: "approved", kind: "image", ...overrides };
}

function pageFor(membership: Record<string, unknown>) {
  mocks.loadOwnerPage.mockResolvedValue({
    locale: "en",
    workspaceSlug: "kam-man-house",
    membership: { workspaceId: "ws-1", workspaceSlug: "kam-man-house", userId: "u", email: "u@example.test", locationScope: null, ...membership },
    ctx: { workspace: { id: "ws-1", market: "tw" }, locations: LOCATIONS },
  });
}

describe("offers page", () => {
  beforeEach(() => {
    vi.stubEnv("OFFER_PROMOTIONS_ENABLED", "true");
    mocks.list.mockResolvedValue([offer("o-ws", null), offer("o-1", "loc-1"), offer("o-2", "loc-2")]);
    mocks.listAssets.mockResolvedValue([]);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it("is a missing page while the flag is off, before anything is read", async () => {
    vi.stubEnv("OFFER_PROMOTIONS_ENABLED", "TRUE");
    await expect(Page(props)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.loadOwnerPage).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("gives an owner every offer and every manage and use decision, in the workspace's market", async () => {
    pageFor({ role: "owner" });
    const element = await Page(props);
    expect(element.props).toMatchObject({
      workspaceId: "ws-1",
      workspaceSlug: "kam-man-house",
      market: "tw",
      role: "owner",
      canManage: { workspace: true, "loc-1": true, "loc-2": true },
      canUse: { workspace: true, "loc-1": true, "loc-2": true },
    });
    expect(element.props.offers.map((o: { id: string }) => o.id)).toEqual(["o-ws", "o-1", "o-2"]);
  });

  it("scopes a manager: reads workspace-wide and in-scope offers, manages only in-scope locations", async () => {
    pageFor({ role: "manager", locationScope: ["loc-1"] });
    const element = await Page(props);
    expect(element.props.canManage).toEqual({ workspace: false, "loc-1": true, "loc-2": false });
    // canUseOffer follows the existing action rules, where a workspace-wide (null) location is in every manager's scope.
    expect(element.props.canUse).toEqual({ workspace: true, "loc-1": true, "loc-2": false });
    expect(element.props.offers.map((o: { id: string }) => o.id)).toEqual(["o-ws", "o-1"]);
  });

  it("lets a viewer read the list and nothing else", async () => {
    pageFor({ role: "viewer" });
    const element = await Page(props);
    expect(Object.values(element.props.canManage).some(Boolean)).toBe(false);
    expect(Object.values(element.props.canUse).some(Boolean)).toBe(false);
    expect(element.props.offers).toHaveLength(3);
  });

  it("offers only rights-approved images, and a scoped manager only those in scope", async () => {
    mocks.listAssets.mockResolvedValue([
      asset("a-shared", null),
      asset("a-1", "loc-1"),
      asset("a-2", "loc-2"),
      asset("a-pending", null, { rights_status: "needs_review" }),
      asset("a-menu", null, { kind: "menu" }),
    ]);
    pageFor({ role: "owner" });
    expect((await Page(props)).props.assets.map((a: { id: string }) => a.id)).toEqual(["a-shared", "a-1", "a-2"]);
    pageFor({ role: "manager", locationScope: ["loc-1"] });
    expect((await Page(props)).props.assets).toEqual([
      { id: "a-shared", filename: "a-shared.jpg", locationId: null },
      { id: "a-1", filename: "a-1.jpg", locationId: "loc-1" },
    ]);
  });
});
