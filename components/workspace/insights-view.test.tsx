// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/en/owner/kam-man-house/insights", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

import { buildAeoTrendModel } from "@/lib/trends/aeo-trend-model";
import { buildTrendModel } from "@/lib/trends/history-model";
import type { InsightsModel } from "@/lib/workspace/queries-pages";
import { InsightsView, insightsLeadSentence } from "./insights-view";

const location = { id: "loc-1", slug: "yik-yam", name: "Yik Yam Street", address: null, district: null, isPrimary: true, placeId: "p1" };
const at = "2026-08-25T01:42:00Z";

function model(overrides: Partial<InsightsModel> = {}): InsightsModel {
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
    ledgerComparable: true,
    ledger: { resolved: ["ig.bio_cta"], regressed: [], decayed: [] },
    perLocation: [],
    deliveries: [{ action_id: "a1", template_key: "ig-bio", title: { en: "Rewrite the bio", "zh-HK": "重寫簡介（港）", "zh-TW": "重寫簡介（台）" }, version_no: 1, mode: "copy", channel: null, delivered_at: at }],
    ...overrides,
  };
}

function render(locale: "en" | "zh-HK" | "zh-TW", overrides: Partial<InsightsModel> = {}) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<InsightsView locale={locale} workspaceSlug="kam-man-house" timezone="Asia/Hong_Kong" locations={[{ slug: location.slug, name: location.name }]} model={model(overrides)} />);
  return root;
}

describe("InsightsView", () => {
  it("shows an attributed card's earlier value instead of claiming there is none", () => {
    const cards = Array.from(render("en").querySelectorAll(".metric-change-card"));
    expect(cards[0].textContent).toContain("From 18");
    expect(cards[0].textContent).not.toContain("No comparable earlier value");
    expect(cards[1].textContent).toContain("No comparable earlier value");
  });

  it("opens the explanation with before and after, with series and presence rates still closed", () => {
    const root = render("zh-HK");
    const why = root.querySelector("details.insights-why");
    expect(why?.children[1].classList.contains("before-after-grid")).toBe(true);
    expect(why?.children[1].textContent).toContain("18 → 46");
    for (const selector of [".insights-series-disclosure", ".insights-presence-disclosure"]) {
      const disclosure = why?.querySelector(selector);
      expect(disclosure?.tagName).toBe("DETAILS");
      expect(disclosure?.hasAttribute("open")).toBe(false);
    }
    expect(why?.querySelector(".trend-card table")?.closest("details")?.classList.contains("insights-series-disclosure")).toBe(true);
    expect(why?.querySelector(".surface-trend-card")?.closest("details")?.classList.contains("insights-presence-disclosure")).toBe(true);
  });

  it("does not invent an earlier value for unknown facts", () => {
    const cards = Array.from(render("en").querySelectorAll(".metric-change-card"));
    expect(cards[1].querySelector("h2")?.textContent).toBe("— → 1");
    expect(cards[1].textContent).toContain("No comparable earlier value");
  });

  it("keeps the comparison limitation first when no metric values are available", () => {
    const why = render("en", { metricCards: [] }).querySelector("details.insights-why");
    expect(why?.children[1].textContent).toContain("No comparable earlier value");
  });

  it("keeps all locations separate without a combined score", () => {
    const root = render("zh-HK", {
      locationSlug: "all",
      perLocation: [{ location, score: 62, coverage: 0.9, comparable: false, observedAt: at }],
    });
    expect(root.querySelector(".page-intro")?.textContent).not.toContain("62");
    expect(root.querySelector(".insight-summary-grid")).toBeNull();
    const why = root.querySelector("details.insights-why");
    expect(why?.hasAttribute("open")).toBe(false);
    expect(why?.querySelector(".location-proof-grid")?.textContent).toContain("62");
  });

  it("names findings and AI surfaces in words, not codes", () => {
    const text = render("en").textContent ?? "";
    expect(text).not.toContain("bio cta");
    expect(text).not.toContain("ai_overview");
    expect(text).toContain("AI Overview presence");
  });

  it("leads zh-HK coverage in shop language and keeps the missing-source rule under 點解咁講", () => {
    const root = render("zh-HK");
    const stats = Array.from(root.querySelectorAll(".insight-stat"));
    const coverage = stats[3];
    expect(coverage?.textContent).toContain("呢次查到");
    expect(coverage?.textContent).not.toContain("覆蓋率");
    const why = coverage?.querySelector("details");
    expect(why?.hasAttribute("open")).toBe(false);
    expect(why?.querySelector("summary")?.textContent).toContain("點解咁講");
    expect(why?.textContent).toContain("唔會當零分");
    expect(why?.textContent).toContain("唔會拉低分數");
    const denominator = root.querySelector(".surface-trend-card details");
    expect(denominator?.hasAttribute("open")).toBe(false);
    expect(denominator?.textContent).toContain("唔會當 0%");
    expect(root.textContent).toContain("睇今次同上次差幾遠。");
    expect(root.textContent).not.toContain("不製造合併平均分");
    expect(root.textContent).not.toContain("比較資格");
  });

  it("leads zh-HK with 有冇好啲 and keeps score maths inside 點解咁講", () => {
    const root = render("zh-HK");
    const intro = root.querySelector(".page-intro");
    expect(intro?.querySelector("h1")?.textContent).toBe("有冇好啲");
    expect(intro?.textContent).toContain("好咗");
    expect(intro?.textContent).not.toMatch(/分母|%|評分方法/);
    const why = root.querySelector("details.insights-why");
    expect(why?.hasAttribute("open")).toBe(false);
    expect(why?.querySelector("summary")?.textContent).toContain("點解咁講");
    expect(why?.querySelector(".insight-summary-grid")).not.toBeNull();
    expect(why?.querySelector(".surface-trend-card")).not.toBeNull();
    expect(why?.textContent).toContain("睇今次同上次差幾遠。");
  });

  it("says what is missing in shop language when a comparison is not possible", () => {
    const root = render("zh-HK", { ledgerComparable: false, ledger: { resolved: [], regressed: [], decayed: [] } });
    const intro = root.querySelector(".page-intro");
    expect(intro?.querySelector("h1")?.textContent).toBe("有冇好啲");
    expect(intro?.textContent).toContain("未有上次可以比");
    expect(intro?.textContent).not.toMatch(/分母|覆蓋率|評分版本/);
    expect(insightsLeadSentence(model({
      ledgerComparable: false,
      ledger: { resolved: [], regressed: [], decayed: [] },
      trend: { ...buildTrendModel(null), reasonCode: "NO_SHARED_MEASURED_MODULE", direction: "unavailable" },
    }), "zh-HK")).toContain("上次同今次查到嘅嘢唔同");
  });

  it("titles delivered work in the page's own locale", () => {
    expect(render("zh-TW").textContent).toContain("重寫簡介（台）");
    expect(render("zh-HK").textContent).toContain("重寫簡介（港）");
  });
});

describe("InsightsView without a comparable diff (guardrails 2 and 3)", () => {
  it("shows resolved and regressed as unknown rather than 0", () => {
    const stats = Array.from(render("en", { ledgerComparable: false, ledger: { resolved: [], regressed: [], decayed: [] } }).querySelectorAll(".insight-stat"));
    expect(stats[1].querySelector("strong")?.textContent).toBe("—");
    expect(stats[2].querySelector("strong")?.textContent).toBe("—");
    expect(stats[1].textContent).toContain("No comparable scan yet");
  });
  it("uses a flat glyph for the score card when there is no comparable change", () => {
    const first = render("en").querySelector(".insight-stat");
    expect(first?.querySelector('[data-trend="flat"]')).not.toBeNull();
    expect(first?.querySelector('[data-trend="up"]')).toBeNull();
  });
});

it.each([
  ["paid owner", true, "再掃一次"],
  ["lite owner", false, "下次掃完再睇"],
  ["viewer", false, "下次掃完再睇"],
  ["out-of-scope manager", false, "下次掃完再睇"],
] as const)("one-scan Insights gives %s an honest next step", (_role, eligible, expected) => {
  const one = model({ ledgerComparable: false, ledger: { resolved: [], regressed: [], decayed: [] }, trend: buildTrendModel(null) });
  expect(insightsLeadSentence(one, "zh-HK", eligible)).toContain(expected);
});
