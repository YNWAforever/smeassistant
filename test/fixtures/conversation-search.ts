import type { ConnectorContext } from "@/lib/connectors/types";
import { buildSearchBriefs, buildSearchGap, type SearchRecord } from "@/lib/workspace/search-gap";

export function gscFixture(patch: Partial<ConnectorContext> = {}): ConnectorContext {
  return { source: "gsc", status: "ready", scope: "sc-domain:shop.example.test", observedAt: "2026-10-28T00:00:00Z", analytics: { startDate: "2026-09-28", endDate: "2026-10-25", country: "hkg", searchType: "web", dimensions: "query", dataState: "final", aggregation: "byPage", pageFilter: "^https://shop\\.example\\.test/", rowLimit: 25, reportedDays: 28 }, items: [{ title: "午餐餐牌", metrics: { impressions: 80, clicks: 0, ctr: 0, position: 9 } }], ...patch };
}
export function gapFixture(source = gscFixture()) { return buildSearchGap({ market: "hk", websiteUrl: "https://shop.example.test/", requestedAt: "2026-10-28T00:00:00Z", source }); }
export function recordFixture(): SearchRecord { const gap = gapFixture(); return { id: "33333333-3333-4333-8333-333333333333", workspaceId: "11111111-1111-4111-8111-111111111111", locationId: "22222222-2222-4222-8222-222222222222", gap, brief: buildSearchBriefs(gap), createdAt: "2026-10-28T00:00:00Z", approvedAt: null, actionId: null }; }
