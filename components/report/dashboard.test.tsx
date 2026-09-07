// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/lib/copy";
import type { ReportProps } from "@/lib/funnel/report-props";
import type { ReportDashboard } from "@/lib/funnel/report-dashboard";
import { DashboardSummary } from "./dashboard-summary";
import { DashboardMetrics } from "./dashboard-metrics";
vi.mock("next/navigation", () => ({ usePathname: () => "/en/r/fixture" }));
const report: ReportProps = {
  locale: "en", access: "viewer", sample: false, slug: "fixture", market: "hk", businessName: "Fixture Cafe",
  district: null, industry: null, status: "done", subtitle: null, scannedAt: "2026-09-07T01:00:00Z", score: 0, coverage: 50,
  comparison: { kind: "first_scan" }, modules: [
    { key: "ig", score: 0, label: "Instagram", state: "measured", value: "0 / 100", detail: "Small sample", observedAt: "2026-09-07", limitationCode: null },
    { key: "aeo", score: null, label: "Search", state: "failed", value: "Unavailable", detail: "Provider timed out", observedAt: null, limitationCode: "PROVIDER_TIMEOUT" },
  ], priorities: [], locked: null, summary: null, findingGroups: [], proof: null, evidence: [], ctas: [],
};
const dashboard: ReportDashboard = {
  metrics: [
    { key: "instagram-followers", label: "Followers", source: "Instagram", state: "measured", value: 0, unit: "count", sampleSize: null },
    { key: "instagram-engagement", label: "Sampled engagement", source: "Instagram", state: "unavailable", reason: "No supported engagement measurement" },
  ], comparisons: [],
};
function markup(element: React.ReactNode) { const root = document.createElement("div"); root.innerHTML = renderToStaticMarkup(element); return root; }
describe("dashboard summary", () => {
  it("retains zero, first scan, coverage, business and access note without a synthetic delta", () => {
    const root = markup(<DashboardSummary report={report} />);
    expect(root.textContent).toContain("Fixture Cafe");
    expect(root.querySelector(".score-number")?.textContent).toBe("0");
    expect(root.textContent).toContain(copy.en.funnel.report.firstScan);
    expect(root.textContent).toContain("50%");
    expect(root.textContent).toContain(copy.en.funnel.report.viewerNote);
    expect(root.querySelector(".delta-up, .delta-down")).toBeNull();
  });
  it("shows incomparable reasons even when the overall score is withheld", () => {
    const root = markup(<DashboardSummary report={{ ...report, score: null, comparison: { kind: "incomparable", reason: "Scoring versions differ" } }} />);
    expect(root.textContent).toContain("Scoring versions differ");
    expect(root.querySelector(".score-dial")).toBeNull();
  });
  it("shows a comparable delta only with the existing comparable classification", () => {
    const root = markup(<DashboardSummary report={{ ...report, comparison: { kind: "comparable", delta: -4, title: "Comparable scan", body: "Shared measured sources" } }} />);
    expect(root.querySelector(".delta-down")?.textContent).toContain("-4");
    expect(root.textContent).toContain("Shared measured sources");
  });
  it("discloses a long supported summary as inference and preserves every word", () => {
    const summary = "Supported interpretation. ".repeat(30);
    const root = markup(<DashboardSummary report={{ ...report, summary }} />);
    expect(root.querySelector("details")?.textContent).toContain(summary);
    expect(root.querySelector("details")?.hasAttribute("open")).toBe(false);
    expect(root.textContent).toContain("Inference");
  });
});
describe("dashboard metrics", () => {
  it("renders measured zero with units and provenance; unavailable cards have no meter", () => {
    const root = markup(<DashboardMetrics report={report} dashboard={dashboard} />);
    const zero = root.querySelector('[data-metric="instagram-followers"]');
    expect(zero?.querySelector("strong")?.textContent).toBe("0");
    expect(zero?.textContent).toContain("followers");
    expect(zero?.textContent).toContain("Instagram");
    expect(zero?.textContent).toContain("2026-09-07");
    const missing = root.querySelector('[data-metric="instagram-engagement"]');
    expect(missing?.textContent).toContain("No supported engagement measurement");
    expect(missing?.querySelector("meter")).toBeNull();
    expect(root.querySelectorAll("meter")).toHaveLength(1);
    expect(root.querySelector("meter")?.getAttribute("value")).toBe("0");
    expect(root.querySelector("meter")?.getAttribute("max")).toBe("100");
    expect(Array.from(root.querySelectorAll("details")).some(detail => detail.textContent?.includes("PROVIDER_TIMEOUT"))).toBe(true);
  });
  it("renders group-specific review scales, rating units and observation context", () => {
    const group = { query: "nearby cafes", engine: "google_maps", source: "Google Maps", observedAt: "2026-09-06T12:00:00Z", sampleSize: 2, rows: [{ name: "Fixture Cafe", value: 0, currentBusiness: true }, { name: "Fixture Other", value: 1200, currentBusiness: false }] };
    const root = markup(<DashboardMetrics report={report} dashboard={{ metrics: [], comparisons: [{ ...group, metric: "reviews" }, { ...group, metric: "rating", rows: [{ name: "Fixture Cafe", value: 4.2, currentBusiness: true }, { name: "Fixture Other", value: 4.8, currentBusiness: false }] }] }} />);
    expect(root.textContent).toContain("nearby cafes"); expect(root.textContent).toContain("google_maps");
    expect(root.textContent).toContain("2026-09-06"); expect(root.textContent).toContain("Sample size: 2");
    expect(root.textContent).toContain("1,200"); expect(root.textContent).toContain("4.2 / 5");
    expect(root.querySelector('meter[max="1200"]')).not.toBeNull(); expect(root.querySelector('meter[max="5"]')).not.toBeNull();
  });
  it.each(["en", "zh-HK", "zh-TW"] as const)("localizes headings and absent dates in %s", locale => {
    const root = markup(<DashboardMetrics report={{ ...report, locale, modules: [], scannedAt: null }} dashboard={dashboard} />);
    expect(root.textContent).toContain(copy[locale].funnel.report.dashboard.unavailable);
    expect(root.querySelector("time")).toBeNull();
    expect(root.querySelector("h2")?.textContent).toBeTruthy();
  });
  it("omits privileged content for public or locked projections even if supplied", () => {
    for (const r of [{ ...report, access: "public" as const }, { ...report, locked: { hiddenFindingCount: 3, unlockHref: "/unlock" } }]) {
      expect(renderToStaticMarkup(<DashboardMetrics report={r} dashboard={dashboard} />)).toBe("");
    }
  });
});
describe("comparison and confidence qualifications", () => {
  it("does not call an incomparable repeat scan a first scan", () => {
    const root = markup(<DashboardSummary report={{ ...report, comparison: { kind: "incomparable", reason: "No shared measured sources" } }} />);
    expect(root.textContent).not.toContain(copy.en.funnel.report.firstScanTitle);
    expect(root.textContent).toContain("No shared measured sources");
  });
  it("keeps measured confidence limitations outside disclosures", () => {
    const root = markup(<DashboardMetrics report={report} dashboard={dashboard} />);
    root.querySelectorAll("details").forEach(detail => detail.remove());
    expect(root.textContent).toContain("Small sample");
  });
  it("labels sample denominators and ratings without changing numeric units", () => {
    const root = markup(<DashboardMetrics report={report} dashboard={{ comparisons: [], metrics: [{ key: "sample", label: "Fixture percentage", source: "Fixture source", state: "measured", value: 0, unit: "percent", sampleSize: 10 }] }} />);
    expect(root.querySelector('[data-metric="sample"]')?.textContent).toContain("0%");
    expect(root.textContent).toContain("Sample size: 10");
  });
});