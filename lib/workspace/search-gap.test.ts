import { describe, expect, it } from "vitest";
import { gscFixture, gapFixture, recordFixture } from "@/test/fixtures/conversation-search";
import { searchCopy } from "@/lib/copy-search-gap";
import { buildSearchBriefs, buildSearchGap, observeSearch } from "./search-gap";

describe("source-scoped search gaps", () => {
  it("makes a cited recommendation without claiming missing content or a ranking win", () => {
    const gap = gapFixture(), briefs = buildSearchBriefs(gap)!;
    expect(gap).toMatchObject({ status: "ready", reason: "review_queries" });
    expect(briefs.en.missing).toContain("have not checked");
    expect(briefs["zh-HK"].citation).toContain("hkg · 2026-09-28 – 2026-10-25");
    expect(briefs.en.steps).toHaveLength(3);
  });
  it.each([
    [gscFixture({ analytics: undefined }), "coverage_missing"],
    [gscFixture({ source: "dataforseo" }), "coverage_missing"],
    [gscFixture({ status: "unsupported" }), "source_unavailable"],
    [gscFixture({ items: [{ title: "best lunch NYC", metrics: { impressions: 500, clicks: 0 } }] }), "language_limited"],
    [gscFixture({ items: [{ title: "午餐", metrics: { impressions: 19, clicks: 0 } }] }), "thin"],
    [gscFixture({ items: [] }), "thin"],
    [gscFixture({ status: "failed" }), "source_unavailable"],
  ] as const)("keeps unsupported, English-only, thin and failed evidence honest", (source, reason) => {
    const gap = gapFixture(source); expect(gap.reason).toBe(reason); expect(gap.queries).toEqual([]); expect(buildSearchBriefs(gap)).toBeNull();
  });
  it("never treats locale, worldwide data, the other market or paid mentions as coverage", () => {
    const source = gscFixture(); source.analytics!.country = "twn";
    expect(gapFixture(source).queries).toEqual([]);
    expect(buildSearchGap({ ...gapFixture(), market: "us" }).queries).toEqual([]);
    const partial = gapFixture(gscFixture({ status: "partial" })); expect(partial.status).toBe("partial"); expect(partial.queries).toHaveLength(1);
  });
  it.each(["東京のおすすめラーメン", "漢字 カフェ", "漢字 한글", "漢字 한글"])("does not turn unsupported-language query %s into a Chinese-language brief", title => {
    const gap = gapFixture(gscFixture({ items: [{ title, metrics: { impressions: 80, clicks: 0 } }] }));
    expect(gap).toMatchObject({ status: "partial", reason: "language_limited", queries: [] });
    expect(buildSearchBriefs(gap)).toBeNull();
  });
  it("keeps mixed supported and unsupported query coverage partial", () => {
    const gap = gapFixture(gscFixture({ items: [
      { title: "午餐餐牌", metrics: { impressions: 80, clicks: 0 } },
      { title: "東京のおすすめラーメン", metrics: { impressions: 80, clicks: 0 } },
    ] }));
    expect(gap.status).toBe("partial");
    expect(gap.queries.map(row => row.title)).toEqual(["午餐餐牌"]);
  });
  it("pins the same five candidates when Google reorders tied query rows", () => {
    const items = ["午餐 F", "午餐 B", "午餐 E", "午餐 C", "午餐 D", "午餐 A"].map(title => ({ title, metrics: { impressions: 80, clicks: 0 } }));
    for (const rows of [items, [...items].reverse()]) {
      const gap = gapFixture(gscFixture({ items: rows }));
      expect(gap.queries.map(row => row.title)).toEqual(["午餐 A", "午餐 B", "午餐 C", "午餐 D", "午餐 E"]);
    }
  });
  it("has matching copy keys in every locale, including recovery states", () => {
    for (const locale of ["zh-HK", "zh-TW"] as const) {
      expect(Object.keys(searchCopy[locale])).toEqual(Object.keys(searchCopy.en));
      expect(Object.keys(searchCopy[locale].reasons)).toEqual(Object.keys(searchCopy.en.reasons));
      expect(Object.keys(searchCopy[locale].observations)).toEqual(Object.keys(searchCopy.en.observations));
    }
  });
});
describe("observation requires comparable baselines", () => {
  const laterFixture = () => { const source = gscFixture({ observedAt: "2026-11-29T12:00:00Z", items: [{ title: "午餐餐牌", metrics: { impressions: 100, clicks: 3 } }] }); source.analytics = { ...source.analytics!, startDate: "2026-10-29", endDate: "2026-11-25" }; return gapFixture(source); };
  const approved = () => ({ ...recordFixture(), approvedAt: "2026-10-28T12:00:00Z", actionId: "task" });
  it("refuses before approval, missing/partial baselines, overlap and windows beginning before confirmation", () => {
    expect(observeSearch(recordFixture(), laterFixture())).toMatchObject({ reason: "approval_required", rows: [] });
    const record = approved(); record.gap.status = "partial";
    expect(observeSearch(record, laterFixture())).toMatchObject({ reason: "baseline_missing", rows: [] });
    expect(observeSearch(approved(), gapFixture())).toMatchObject({ reason: "later_window_required", rows: [] });
    expect(observeSearch({ ...approved(), approvedAt: "2026-11-03T00:00:00Z" }, laterFixture())).toMatchObject({ reason: "later_window_required", rows: [] });
  });
  it("shows only observed counts on exact queries, with full windows and no inferred lift", () => {
    const result = observeSearch(approved(), laterFixture());
    expect(result).toMatchObject({ status: "ready", reason: "comparable", rows: [{ query: "午餐餐牌", beforeClicks: 0, afterClicks: 3, beforeImpressions: 80, afterImpressions: 100 }] });
    expect(result).not.toHaveProperty("lift"); expect(result).not.toHaveProperty("attribution");
  });
  it("rejects a changed property, website, market, country, bounded sample, window length and missing or thin queries", () => {
    const mutations: Array<(gap: ReturnType<typeof gapFixture>) => void> = [
      gap => { gap.source.scope = "sc-domain:other.test"; }, gap => { gap.websiteUrl = "https://other.test/"; }, gap => { gap.market = "tw"; },
      gap => { gap.source.analytics!.country = "twn"; }, gap => { gap.source.status = "partial"; }, gap => { gap.source.analytics!.startDate = "2026-10-30"; },
      gap => { gap.source.analytics!.reportedDays = 27; }, gap => { gap.source.items = []; }, gap => { gap.source.items[0].metrics!.impressions = 19; },
    ];
    for (const mutate of mutations) { const later = laterFixture(); mutate(later); expect(observeSearch(approved(), later).status).not.toBe("ready"); expect(observeSearch(approved(), later).rows).toEqual([]); }
  });
});
