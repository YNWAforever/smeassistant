// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/lib/copy";
import type { ReportProps } from "@/lib/funnel/report-props";
import type { ReportDashboard } from "@/lib/funnel/report-dashboard";
import { DashboardSummary } from "./dashboard-summary";
import { DashboardMetrics } from "./dashboard-metrics";
vi.mock("next/navigation", () => ({ usePathname: () => "/en/r/fixture", useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
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
  it("uses neutral copy when a real report comparison has not been evaluated", () => {
    const root = markup(<DashboardSummary report={{ ...report, comparison: { kind: "not_evaluated" } }} />);
    expect(root.textContent).toContain(copy.en.funnel.report.comparisonLabel);
    expect(root.textContent).toContain(copy.en.funnel.report.dashboard.unavailable);
    expect(root.textContent).not.toContain(copy.en.funnel.report.firstScan);
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
// The complete page must enforce the same projection boundary as its children.
import { ReportPage } from "@/components/report-view";
import { DashboardPriorities } from "./dashboard-priorities";
const priority = (rank: number): ReportProps["priorities"][number] => ({ key: `priority-${rank}`, rank, label: `Action ${rank}`, module: "ig", moduleLabel: "Instagram", severity: "high", severityLabel: "High", tone: "high", scoreImpact: null, overallImpact: null, summary: "Supporting sentence", action: "Private action", evidence: { source: "Private source", excerpt: "Private excerpt", observedAt: null }, effort: null });
const detailed: ReportProps = { ...report, priorities: [priority(2), priority(1), priority(3), priority(4)], findingGroups: [{ module: "ig", label: "Instagram details", findings: [{ id: "finding", key: "priority-2", module: "ig", label: "Private finding", severity: "high", severityLabel: "High", tone: "high", scoreImpact: null, overallImpact: null, message: "Private message", action: "Private action", evidence: [["source", "Private excerpt"]], fixPackDraft: "Private draft" }] }], evidence: [{ id: "image", provider: "instagram", evidenceType: "post", sourceUrl: "https://example.com/source", mediaUrl: "/private-photo", capturedAt: "2026-09-07", publishedAt: null, text: "Fixture photo", status: "stored", limitationCode: null }] };
describe("dashboard priorities", () => {
  it("preserves supplied non-sequential ranks instead of using display indexes", () => {
    const root = markup(<DashboardPriorities report={{ ...report, priorities: [priority(7), priority(12)] }} />);
    const cards = root.querySelectorAll('[data-dashboard-priorities] article');
    expect(Array.from(cards).map(card => card.querySelector("div span")?.textContent)).toEqual(["07", "12"]);
    expect(Array.from(cards).map(card => card.querySelector("h3")?.textContent)).toEqual(["Action 7", "Action 12"]);
  });

  it("keeps the priority label while omitting absent action and summary paragraphs", () => {
    const item = { ...priority(7), action: null, summary: null };
    const root = markup(<DashboardPriorities report={{ ...report, priorities: [item] }} />);
    const article = root.querySelector('[data-dashboard-priorities] article')!;
    expect(article.querySelector("h3")?.textContent).toBe("Action 7");
    expect(article.querySelector("p")).toBeNull();
  });
});
describe("dashboard page integration", () => {
  it.each([0, 2, 3, 4])("shows at most three supported priorities from %s without reordering", count => {
    const root = markup(<ReportPage {...detailed} priorities={detailed.priorities.slice(0, count)} />);
    const cards = root.querySelectorAll('[data-dashboard-priorities] article');
    expect(cards).toHaveLength(Math.min(count, 3));
    expect(Array.from(cards).map(card => card.querySelector("h3")?.textContent)).toEqual(detailed.priorities.slice(0, Math.min(count, 3)).map(item => item.label));
  });
  it("puts metrics before priorities and gallery before collapsed full evidence with visible anchor targets", () => {
    const root = markup(<ReportPage {...detailed} />);
    expect(root.querySelectorAll("h1")).toHaveLength(1);
    const priorities = root.querySelector('[data-dashboard-priorities]')!;
    expect(root.querySelector('meter')!.compareDocumentPosition(priorities) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const anchor = root.querySelector('#report-detail-ig')!;
    expect(anchor).not.toBeNull();
    expect(anchor.closest('details')).toBeNull();
    expect(anchor.nextElementSibling?.tagName).toBe('DETAILS');
    expect(anchor.nextElementSibling?.hasAttribute('open')).toBe(false);
    expect(root.querySelector('img')!.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(priorities.querySelector('a')?.getAttribute('href')).toBe('#report-detail-ig');
    expect(root.textContent).toContain('Private draft');
  });
  it("omits all privileged content from public and locked pages but retains coverage and unlock links", () => {
    for (const access of ['public', 'viewer'] as const) {
      const root = markup(<ReportPage {...detailed} access={access} summary="Private summary" locked={{ hiddenFindingCount: 2, unlockHref: '/unlock' }} />);
      expect(root.innerHTML).not.toMatch(/Private (action|source|excerpt|finding|message|draft|summary)|private-photo/);
      expect(root.textContent).toContain('Small sample');
      expect(root.querySelector('[data-dashboard-priorities] a')?.getAttribute('href')).toBe('/unlock');
      expect(root.querySelector('[id^="report-detail-"]')).toBeNull();
    }
    const publicRoot = markup(<ReportPage {...detailed} access="public" />);
    expect(publicRoot.innerHTML).not.toMatch(/Private (action|source|excerpt|finding|message|draft)|private-photo/);
  });
});
it("keeps the complete priority context in authorized disclosures even without finding groups", () => {
  const root = markup(<ReportPage {...report} priorities={[{ ...priority(1), overallImpact: 'Recorded impact', evidence: { source: 'Original source', excerpt: 'Complete excerpt', observedAt: '2026-09-06' } }]} />);
  const disclosures = Array.from(root.querySelectorAll('details')).map(item => item.textContent).join(' ');
  for (const text of ['Supporting sentence', 'Private action', 'Original source', 'Complete excerpt', '2026-09-06', 'Recorded impact']) expect(disclosures).toContain(text);
  expect(root.querySelector('[data-dashboard-priorities] a')).toBeNull();
});
it.each(['en', 'zh-HK', 'zh-TW'] as const)('renders no-image partial and failed report fixtures honestly in %s', locale => {
  for (const status of ['partial', 'failed']) {
    const root = markup(<ReportPage {...report} locale={locale} status={status} score={null} modules={report.modules.filter(item => item.state !== 'measured')} proof={null} evidence={[]} />);
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('meter')).toBeNull();
    expect(root.querySelector('.score-dial')).toBeNull();
    expect(root.textContent).toContain(copy[locale].funnel.report.dashboard.unavailable);
  }
});
it('supports the original sample report with no images or proof', () => {
  const root = markup(<ReportPage {...report} sample={true} access="sample" proof={null} evidence={[]} />);
  expect(root.querySelector('img')).toBeNull();
  expect(root.querySelector('[data-slot="dialog-trigger"]')).toBeNull();
  expect(root.textContent).toContain(copy.en.funnel.report.dashboard.unavailable);
});
describe("scan metric dashboard integration", () => {
 it("replaces the placeholder and explains historical engagement inside statistics", () => {
  const scanMetrics: NonNullable<ReportProps["scanMetrics"]> = { instagram: { distinctPosts: 1, datedPosts: 0, earliest: null, latest: null, engagement: "unavailable_historical_counts", coverage: { inspected: 1, duplicates: 0, excluded: { unknown: 0, failed: 0, unsupported: 0, no_answer: 0, conflict: 0, unidentified: 0 }, truncated: false, evidenceTruncated: false }, observations: [] }, search: [{ engine: "google", queryType: null, context: "{}", surface: "organic", numerator: 0, denominator: 1, state: "measured", coverage: { inspected: 1, duplicates: 0, excluded: { unknown: 0, failed: 0, unsupported: 0, no_answer: 0, conflict: 0, unidentified: 0 }, truncated: false, evidenceTruncated: false }, observations: [] }], omittedSearchGroups: 0 };
  const root = markup(<DashboardMetrics report={{ ...report, scanMetrics, modules: report.modules.map(row => ({ ...row, state: "measured" })) }} dashboard={{ ...dashboard, metrics: [...dashboard.metrics, { key: "search-visibility", label: "Search visibility", source: "Search", state: "unavailable", reason: "Not enough data" }] }} />);
  expect(root.querySelector('[data-metric="search-visibility"]')).toBeNull();
  expect(root.querySelector('[data-metric="instagram-engagement"]')?.textContent).toContain("historical counts");
  expect(root.querySelector('[aria-labelledby="dashboard-statistics"] #scan-metrics-title')).not.toBeNull();
  expect(root.querySelector('[data-metric="instagram-followers"]')).not.toBeNull();
  expect(root.querySelector('[aria-labelledby="dashboard-comparisons"]')).not.toBeNull();
 });
});
