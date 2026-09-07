// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReportProps } from "@/lib/funnel/report-props";
import type { Coverage } from "@/lib/report/scan-metrics/types";
import { ScanMetricsPanel } from "./scan-metrics";
const coverage: Coverage = { inspected: 4, duplicates: 1, excluded: { unknown: 1, failed: 0, unsupported: 0, no_answer: 0, conflict: 0, unidentified: 0 }, truncated: true, evidenceTruncated: true };
const report: ReportProps = {
 locale: "en", access: "viewer", sample: false, slug: "fixture", market: "hk", businessName: "Cafe", district: null, industry: null, status: "done", subtitle: null, scannedAt: "2026-09-07", score: 0, coverage: 50, comparison: { kind: "first_scan" },
 modules: ["ig", "aeo"].map(key => ({ key, score: 0, label: key, state: "measured", value: "0", detail: "", observedAt: null, limitationCode: null })), priorities: [], locked: null, summary: null, findingGroups: [], proof: null, evidence: [], ctas: [],
 scanMetrics: { instagram: { distinctPosts: 2, datedPosts: 1, earliest: "2026-08-01", latest: "2026-08-01", engagement: "unavailable_historical_counts", coverage, observations: [{ identity: "private-post", postedAt: null, likes: 0, comments: 3, ambiguousZero: true }] }, search: [{ engine: "google", queryType: "discovery", context: '{"gl":"hk","hl":"zh-HK","location":"Kowloon","device":"mobile","ll":null}', surface: "organic", numerator: 0, denominator: 2, state: "measured", coverage, observations: [{ query: "private query", observedAt: null, outcome: "absent" }] }], omittedSearchGroups: 3 }
};
function markup(value: ReportProps) { const root = document.createElement("div"); root.innerHTML = renderToStaticMarkup(<ScanMetricsPanel report={value} />); return root; }
describe("scan metrics", () => {
 it("rejects poisoned public and locked props", () => {
  expect(markup({ ...report, access: "public" }).innerHTML).toBe("");
  expect(markup({ ...report, locked: { hiddenFindingCount: 2, unlockHref: "/unlock" } }).innerHTML).toBe("");
 });
 it("rejects stale metrics when current modules are not measured", () => {
  expect(markup({ ...report, modules: [] }).innerHTML).toBe("");
  expect(markup({ ...report, modules: report.modules.map(row => ({ ...row, state: "failed" })) }).innerHTML).toBe("");
  const root = markup({ ...report, modules: report.modules.filter(row => row.key === "ig") });
  expect(root.textContent).not.toContain("private query");
  expect(root.textContent).not.toContain("groups omitted");
 });
 it.each(["en", "zh-HK", "zh-TW"] as const)("renders zero, localized coverage and date provenance in %s", locale => {
  const root = markup({ ...report, locale });
  expect(root.querySelector('meter[value="0"][max="2"]')).not.toBeNull();
  expect(root.textContent).toContain("0%");
  expect(root.textContent).toContain("2026-08-01");
  expect(root.textContent).toContain("2026-09-07");
  expect(root.textContent).toContain("Kowloon");
  expect(root.textContent).not.toContain('{"gl"');
  expect(root.textContent).not.toContain("no_answer");
  expect(root.querySelectorAll("details")).toHaveLength(2);
  expect(root.querySelector("details")?.hasAttribute("open")).toBe(false);
  expect(root.querySelector('time[datetime="2026-08-01"]')).not.toBeNull();
  root.querySelectorAll("details").forEach(row => row.remove());
  expect(root.textContent).toContain(locale === "en" ? "Incomplete sample" : "樣本不完整");
  expect(root.textContent).toContain(locale === "en" ? "3 search groups omitted" : "已省略 3 組搜尋");
  expect(root.textContent).toContain(locale === "en" ? "Evidence rows limited" : "證據列已截短");
 });
 it("does not draw an unavailable zero-denominator meter", () => {
  const root = markup({ ...report, scanMetrics: { ...report.scanMetrics!, instagram: null, search: [{ ...report.scanMetrics!.search[0], denominator: 0, state: "unavailable" }] } });
  expect(root.querySelector("meter")).toBeNull();
  expect(root.textContent).toContain("Measurement unavailable");
  expect(root.textContent).not.toContain("0%");
 });
 it("qualifies recorded zero counts and captured-surface outcomes", () => {
  const text = markup(report).textContent;
  expect(text).toContain("Recorded likes: 0");
  expect(text).toContain("Recorded comments: 3");
  expect(text).toContain("Historical zeros may mean missing counts");
  expect(text).toContain("No confirmed appearance in captured surface");
  expect(text).toContain("Observation date unavailable");
 });
});

describe("separate captured surfaces", () => {
 it.each(["en", "zh-HK", "zh-TW"] as const)("keeps engine, query type, context and surface groups separate in %s", locale => {
  const base = report.scanMetrics!.search[0];
  const search = [base, { ...base, engine: "google_maps", surface: "maps" as const, queryType: "branded", context: '{"location":"Taipei"}' }, { ...base, engine: "google_ai_mode", surface: "ai" as const, context: '{"location":"Central"}' }];
  const root = markup({ ...report, locale, modules: report.modules.filter(row => row.key === "aeo"), scanMetrics: { ...report.scanMetrics!, search } });
  expect(root.querySelectorAll("article")).toHaveLength(3);
  expect(root.querySelectorAll("meter")).toHaveLength(3);
  expect(root.textContent).not.toContain("private-post");
  expect(root.textContent).toContain("Taipei");
  expect(root.textContent).toContain("Central");
  expect(root.textContent).toContain("google_ai_mode");
  expect(root.textContent).toContain(locale === "en" ? "Google Maps" : "Google 地圖");
  expect(root.textContent).toContain(locale === "en" ? "AI mentions" : "AI 提及");
  expect(root.textContent).toContain(locale === "en" ? "Branded" : "品牌");
 });
 it("never substitutes scan time for an unrecorded evidence timestamp", () => {
  const root = markup(report);
  expect(root.querySelectorAll('time[datetime="2026-09-07"]')).toHaveLength(1);
  expect(root.querySelectorAll("details time")).toHaveLength(0);
 });
});

