// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/en/sample-report", useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

import { copy } from "@/lib/copy";
import { buildReportDashboard } from "@/lib/funnel/report-dashboard";
import { sampleReportProps } from "@/lib/funnel/sample-report";
import { DashboardMetrics } from "./dashboard-metrics";

function render(locale: "en" | "zh-HK" | "zh-TW") {
  const report = sampleReportProps(locale);
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<DashboardMetrics report={report} dashboard={buildReportDashboard(report)} />);
  return { root, report, d: copy[locale].funnel.report.dashboard };
}

/**
 * The sample used to label Google, website and search rows "Measured" while
 * printing "Measurement unavailable" beside them, and every key statistic was
 * unavailable with no observation date.
 */
describe.each(["en", "zh-HK", "zh-TW"] as const)("sample report dashboard (%s)", (locale) => {
  it("never says a measured source is unavailable", () => {
    const { root, report, d } = render(locale);
    const rows = Array.from(root.querySelectorAll("[aria-labelledby='dashboard-rubric'] article"));
    expect(rows).toHaveLength(report.modules.length);
    for (const [index, module] of report.modules.entries()) {
      const text = rows[index].textContent ?? "";
      if (module.state === "measured") {
        expect(text).toContain(module.value);
        expect(text).not.toContain(d.unavailable);
      } else {
        expect(text).toContain(d.unavailable);
      }
      expect(text).not.toContain(d.dateUnavailable);
    }
  });

  it("shows the demo's stated facts as key statistics and keeps Instagram honestly unavailable", () => {
    const { root, d } = render(locale);
    const tile = (key: string) => root.querySelector(`[data-metric='${key}']`)?.textContent ?? "";
    expect(tile("google-response-rate")).toContain("18");
    expect(tile("google-unanswered-reviews")).toContain("7");
    expect(tile("website-checks")).toMatch(/12.*15/);
    expect(tile("search-visibility")).toMatch(/2.*5/);
    for (const key of ["google-response-rate", "google-unanswered-reviews", "website-checks", "search-visibility"]) {
      expect(tile(key)).not.toContain(d.unavailable);
      expect(tile(key)).toContain("2026-08-25");
    }
    expect(tile("instagram-followers")).toContain(d.unavailable);
  });

  it("does not invent a Google rating or review count the demo never stated", () => {
    const { root } = render(locale);
    expect(root.querySelector("[data-metric='google-rating']")).toBeNull();
    expect(root.querySelector("[data-metric='google-reviews']")).toBeNull();
  });
});

describe("real reports keep deriving tiles from proof", () => {
  it("ignores the sample override when it is absent", () => {
    const report = { ...sampleReportProps("en"), sample: false, access: "viewer" as const, dashboardMetrics: undefined };
    expect(buildReportDashboard(report).metrics.map((metric) => metric.key)).toEqual([
      "instagram-followers", "instagram-engagement", "google-rating", "google-reviews", "search-visibility",
    ]);
  });
});
