// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/en/owner/kam-man-house/insights", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

import { buildAeoTrendModel } from "@/lib/trends/aeo-trend-model";
import { buildTrendModel } from "@/lib/trends/history-model";
import type { InsightsModel } from "@/lib/workspace/queries-pages";
import { InsightsView } from "./insights-view";

const location = { id: "loc-1", slug: "yik-yam", name: "Yik Yam Street", address: null, district: null, isPrimary: true, placeId: "p1" };
const at = "2026-08-25T01:42:00Z";

function model(): InsightsModel {
  return {
    locationSlug: "yik-yam",
    location,
    series: [{ snapshotId: "s1", observedAt: at, score: 62, coverage: 0.9, comparable: false, incomparableReason: null }],
    trend: buildTrendModel(null),
    aeoTrend: buildAeoTrendModel([{ job_id: "j1", surface: "ai_overview", cited: true, captured_at: at }]),
    metricCards: [
      { metricKey: "gbp.response_rate_pct", before: 18, after: 46, delta: 28, factType: "Attributed", observedAt: at },
      { metricKey: "aeo.ai_citation_count", before: null, after: 1, delta: null, factType: "Unknown", observedAt: at },
    ],
    ledger: { resolved: ["ig.bio_cta"], regressed: [], decayed: [] },
    perLocation: [],
    deliveries: [{ action_id: "a1", template_key: "ig-bio", title: { en: "Rewrite the bio", "zh-HK": "重寫簡介（港）", "zh-TW": "重寫簡介（台）" }, version_no: 1, mode: "copy", channel: null, delivered_at: at }],
  };
}

function render(locale: "en" | "zh-HK" | "zh-TW") {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<InsightsView locale={locale} workspaceSlug="kam-man-house" timezone="Asia/Hong_Kong" locations={[{ slug: location.slug, name: location.name }]} model={model()} />);
  return root;
}

describe("InsightsView", () => {
  it("shows an attributed card's earlier value instead of claiming there is none", () => {
    const cards = Array.from(render("en").querySelectorAll(".metric-change-card"));
    expect(cards[0].textContent).toContain("From 18");
    expect(cards[0].textContent).not.toContain("No comparable earlier value");
    expect(cards[1].textContent).toContain("No comparable earlier value");
  });

  it("names findings and AI surfaces in words, not codes", () => {
    const text = render("en").textContent ?? "";
    expect(text).not.toContain("bio cta");
    expect(text).not.toContain("ai_overview");
    expect(text).toContain("AI Overview presence");
  });

  it("titles delivered work in the page's own locale", () => {
    expect(render("zh-TW").textContent).toContain("重寫簡介（台）");
    expect(render("zh-HK").textContent).toContain("重寫簡介（港）");
  });
});
