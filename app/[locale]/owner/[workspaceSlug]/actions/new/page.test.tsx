// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadOwnerPage: vi.fn(), offers: vi.fn(), packs: vi.fn() }));
vi.mock("@/lib/workspace/page-context", () => ({ loadOwnerPage: mocks.loadOwnerPage, ownerPageMetadata: vi.fn(), inScopeFor: () => true }));
vi.mock("@/lib/workspace/queries-pages", () => ({ listCreateRecommendationSummaries: async () => [] }));
vi.mock("@/components/workspace/create-view", () => ({ CreateView: () => <p>goal-mode</p> }));
vi.mock("@/components/workspace/new/offers-mode", () => ({ default: async () => { mocks.offers(); return <p>offer-mode</p>; } }));
vi.mock("@/components/workspace/pack-card", () => ({ PackCard: () => <p>pack-mode</p> }));
vi.mock("@/lib/workspace/packs", () => ({ loadHomeWorkPacks: async () => { mocks.packs(); return { enabled: true, card: {}, earlierDrafts: {} }; } }));

import Page from "./page";

function pageFor(query: Record<string, string>, isDemo = false) {
  mocks.loadOwnerPage.mockResolvedValue({
    locale: "en", isChinese: false, workspaceSlug: "kam-man-house", locationSlug: "yik-yam", query,
    membership: { role: "owner", userId: "u", locationScope: null },
    ctx: { workspace: { id: "ws-1", isDemo }, locations: [{ id: "loc-1", slug: "yik-yam", name: "Yik Yam" }] },
    locations: [{ slug: "yik-yam", name: "Yik Yam" }],
  });
}
async function html(query: Record<string, string>, isDemo = false) {
  pageFor(query, isDemo);
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "en", workspaceSlug: "kam-man-house" }) }));
  return root;
}

describe("Actions › New", () => {
  beforeEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
  afterEach(() => vi.unstubAllEnvs());

  it("shows only the goal mode, with no mode tabs, while both flags are off", async () => {
    const root = await html({ mode: "offer" });
    expect(root.textContent).toBe("goal-mode");
    expect(root.querySelector("nav")).toBeNull();
    expect(mocks.offers).not.toHaveBeenCalled();
  });

  it("offers the Offer mode only when its flag is on and the workspace is not a demo", async () => {
    vi.stubEnv("OFFER_PROMOTIONS_ENABLED", "true");
    const root = await html({ mode: "offer" });
    expect(root.textContent).toContain("offer-mode");
    expect(Array.from(root.querySelectorAll("nav a")).map((a) => a.getAttribute("href"))).toEqual([
      "/en/owner/kam-man-house/actions/new?location=yik-yam",
      "/en/owner/kam-man-house/actions/new?mode=offer&location=yik-yam",
    ]);
    expect(root.querySelector('nav a[aria-current="page"]')?.textContent).toContain("Offer");
    const demo = await html({ mode: "offer" }, true);
    expect(demo.textContent).toBe("goal-mode");
  });

  it("offers the Starter pack mode only when work packs are on", async () => {
    vi.stubEnv("WORK_PACKS_ENABLED", "true");
    const root = await html({ mode: "pack" });
    expect(root.textContent).toContain("pack-mode");
    expect(mocks.packs).toHaveBeenCalledOnce();
  });

  it("falls back to the goal mode for an unknown mode", async () => {
    vi.stubEnv("OFFER_PROMOTIONS_ENABLED", "true");
    vi.stubEnv("WORK_PACKS_ENABLED", "true");
    const root = await html({ mode: "anything" });
    expect(root.textContent).toContain("goal-mode");
    expect(root.querySelectorAll("nav a")).toHaveLength(3);
  });
});
