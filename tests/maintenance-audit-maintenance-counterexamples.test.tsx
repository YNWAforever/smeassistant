// @vitest-environment jsdom
// Audit-only counterexamples. Desired behavior assertions intentionally fail at 301be115.
import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ActionOverview } from "@/lib/workspace/overview";

const fixture = vi.hoisted(() => ({ listActions: vi.fn(), loadOwnerPage: vi.fn() }));
vi.mock("@/lib/workspace/queries-pages", () => ({ listCreateRecommendationSummaries: fixture.listActions }));
vi.mock("@/lib/workspace/page-context", () => ({ loadOwnerPage: fixture.loadOwnerPage, inScopeFor: () => true, ownerPageMetadata: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/en/owner/audit/create", useSearchParams: () => new URLSearchParams() }));
import CreateRoute from "@/app/[locale]/owner/[workspaceSlug]/actions/new/page";
import { CalendarView } from "@/components/workspace/calendar-view";

const props = { params: Promise.resolve({ locale: "en", workspaceSlug: "audit" }) };
const locs = [{ id: "loc-1", slug: "primary", name: "Primary" }, { id: "loc-2", slug: "secondary", name: "Secondary" }];
function action(id: string, key: string, factType: string) {
  return { id, templateKey: key, evidence: { factType, source: factType === "Recommended" ? "Owner objective" : "Scan", detail: { en: "Promote our lunch menu", "zh-HK": "推廣午市餐牌", "zh-TW": "推廣午市餐牌" }, freshness: { en: "Today", "zh-HK": "今日", "zh-TW": "今日" } } } as ActionOverview;
}
beforeEach(() => {
  vi.clearAllMocks();
  fixture.loadOwnerPage.mockResolvedValue({ locale: "en", workspaceSlug: "audit", membership: { role: "owner" }, ctx: { workspace: { id: "ws-1" }, locations: locs }, locations: locs, locationSlug: "all" });
});

it("keeps a stored owner objective Recommended after revisiting Create", async () => {
  fixture.listActions.mockResolvedValue([action("objective-1", "review-response", "Recommended")]);
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(await CreateRoute(props));
  const evidence = root.querySelector(".fact-stack")?.textContent;
  console.info("AUDIT owner-objective fact stack", evidence);
  expect(evidence).not.toContain("Observed");
});

it("includes an evidence-backed FAQ goal beyond the first 25 multi-location actions", async () => {
  const manyLocations = Array.from({ length: 26 }, (_, i) => ({ id: `loc-${i+1}`, slug: `shop-${i+1}`, name: `Shop ${i+1}` }));
  fixture.loadOwnerPage.mockResolvedValue({ locale: "en", workspaceSlug: "audit", membership: { role: "owner" }, ctx: { workspace: { id: "ws-1" }, locations: manyLocations }, locations: manyLocations, locationSlug: "all" });
  const firstPage = Array.from({ length: 25 }, (_, i) => action(`review-location-${i + 1}`, "review-response", "Observed"));
  const secondPage = [action("faq-location-26", "visibility-content", "Observed")];
  // Valid paged-query contract: 26 open actions across 26 locations, with the FAQ last.
  fixture.listActions.mockResolvedValue([firstPage[0],...secondPage]);
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(await CreateRoute(props));
  console.info("AUDIT recommended goal cards", Array.from(root.querySelectorAll(".goal-card h2")).map(n => n.textContent));
  // The recommended tab must include the existing FAQ action, regardless of list page boundaries.
  expect(root.querySelectorAll(".goal-card").length).toBe(2);
});

it("keeps the secondary shop selected when opening its cadence Insights link", () => {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<CalendarView locale="en" workspaceSlug="audit" timezone="Asia/Hong_Kong" model={{ nextScans: [{ locationId: "loc-2", locationSlug:"secondary", locationName: "Secondary", placeId: "place-2", cadence: "monthly", anniversaryDay: 11 }], dueActions: [] }} />);
  const href = root.querySelector(".calendar-list a")?.getAttribute("href");
  console.info("AUDIT secondary-shop insights href", href);
  expect(href).toBe("/en/owner/audit/insights?location=secondary");
});
