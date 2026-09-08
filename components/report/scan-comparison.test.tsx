// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReportProps } from "@/lib/funnel/report-props";
import type { MetricChange, ScanComparison } from "@/lib/report/comparison/types";
import { ScanComparisonPanel } from "./scan-comparison";

const row = (overrides: Partial<MetricChange> = {}): MetricChange => ({
  key: "comparison-1", engine: "google", surface: "organic", queryType: "discovery",
  gl: "hk", hl: "en", location: "Hong Kong", device: "desktop", ll: null,
  previous: 1, current: 2, denominator: 2, deltaPercentagePoints: 50, direction: "increased",
  evidence: [{ query: "fixture cafe", previous: false, current: true,
    previousObservedAt: "2026-08-01T01:00:00Z", currentObservedAt: "2026-09-01T02:00:00Z" }],
  omittedPrevious: 0, omittedCurrent: 0, ...overrides,
});
const available = (overrides: Partial<Extract<ScanComparison, { kind: "available" }>["changes"]> = {}): ScanComparison => ({
  kind: "available", changes: { previousScannedAt: "2026-08-01T00:00:00Z", currentScannedAt: "2026-09-01T00:00:00Z",
    rows: [row()], counts: { increased: 1, decreased: 0, unchanged: 0 }, ig: null, unavailableGroups: 0, ...overrides },
});
const report = (scanComparison: ScanComparison, locale: ReportProps["locale"] = "en"): ReportProps => ({
  locale, access: "viewer", sample: false, slug: "fixture", market: locale === "zh-TW" ? "tw" : "hk",
  businessName: "Fixture Cafe", district: null, industry: null, status: "done", subtitle: null,
  scannedAt: "2026-09-01T00:00:00Z", score: 50, coverage: 100, comparison: { kind: "not_evaluated" },
  modules: [], priorities: [], locked: null, summary: null, findingGroups: [], proof: null, evidence: [], ctas: [], scanComparison,
});
const markup = (props: ReportProps) => { const root = document.createElement("div"); root.innerHTML = renderToStaticMarkup(<ScanComparisonPanel report={props} />); return root; };

describe("ScanComparisonPanel", () => {
  it.each([
    ["en", "Changes since the previous comparable scan", "Increased"],
    ["zh-HK", "與上次可比較掃描的變化", "上升"],
    ["zh-TW", "與上次可比較掃描的變化", "上升"],
  ] as const)("localizes values and changes in %s", (locale, title, increased) => {
    const root = markup(report(available(), locale));
    expect(root.textContent).toContain(title); expect(root.textContent).toContain(increased);
    expect(root.textContent).toContain("1/2"); expect(root.textContent).toContain("2/2"); expect(root.textContent).toContain("+50");
    expect(root.querySelectorAll("time")).toHaveLength(4);
  });

  it("renders unchanged rows and exact observation dates inside evidence", () => {
    const root = markup(report(available({ rows: [row({ previous: 1, current: 1, deltaPercentagePoints: 0, direction: "unchanged" })], counts: { increased: 0, decreased: 0, unchanged: 1 } })));
    expect(root.textContent).toContain("Unchanged"); expect(root.textContent).toContain("0 pp");
    expect(root.querySelector('details time[dateTime="2026-08-01T01:00:00Z"]')).not.toBeNull();
    expect(root.querySelector('details time[dateTime="2026-09-01T02:00:00Z"]')).not.toBeNull();
  });

  it.each([
    ["en", "Instagram sampled posts", "3 posts", "5 posts", "+2 posts"],
    ["zh-HK", "Instagram 已抽樣帖文", "3 則帖文", "5 則帖文", "+2 則帖文"],
    ["zh-TW", "Instagram 已抽樣貼文", "3 則貼文", "5 則貼文", "+2 則貼文"],
  ] as const)("keeps IG-only changes neutral with post units in %s", (locale, label, previous, current, delta) => {
    const root = markup(report(available({ rows: [], counts: { increased: 0, decreased: 0, unchanged: 0 }, ig: { previous: 3, current: 5, delta: 2 } }), locale));
    expect(root.textContent).toContain(label); expect(root.textContent).toContain(previous);
    expect(root.textContent).toContain(current); expect(root.textContent).toContain(delta);
    expect(root.querySelector('[data-direction="increased"]')).toBeNull();
  });

  it("renders neutral unavailable and partial cohort explanations", () => {
    const unavailable = markup(report({ kind: "unavailable", reason: "no_accessible_pair" }));
    expect(unavailable.textContent).toContain("No authorized comparable scan is available");
    expect(unavailable.textContent).not.toMatch(/first scan/i);
    const partial = markup(report(available({ unavailableGroups: 2 })));
    expect(partial.textContent).toContain("2"); expect(partial.textContent).toContain("not comparable");
  });

  it("distinguishes identical sources with different safe contexts without exposing raw keys", () => {
    const root = markup(report(available({ rows: [row(), row({ key: "comparison-2", location: "Kowloon", device: "mobile" })], counts: { increased: 2, decreased: 0, unchanged: 0 } })));
    expect(root.textContent).toContain("Hong Kong"); expect(root.textContent).toContain("Kowloon");
    expect(root.textContent).toContain("Desktop"); expect(root.textContent).toContain("Mobile");
    expect(root.innerHTML).not.toContain('[\"google\"');
  });

  it("returns null for direct public and locked prop injection", () => {
    const comparison = available();
    expect(renderToStaticMarkup(<ScanComparisonPanel report={{ ...report(comparison), access: "public" }} />)).toBe("");
    expect(renderToStaticMarkup(<ScanComparisonPanel report={{ ...report(comparison), locked: { hiddenFindingCount: 1, unlockHref: "/unlock" } }} />)).toBe("");
  });
});