import type { ConnectorContext, ContextItem } from "@/lib/connectors/types";
import type { PrototypeLocale } from "@/lib/copy";
import { searchCopy } from "@/lib/copy-search-gap";

export type GapReason = "review_queries" | "thin" | "language_limited" | "no_review_queries" | "coverage_missing" | "source_unavailable";
export interface SearchGap {
  version: 1;
  market: string;
  websiteUrl: string | null;
  requestedAt: string;
  status: "ready" | "partial" | "empty" | "unavailable" | "failed";
  reason: GapReason;
  source: ConnectorContext;
  queries: ContextItem[];
}
export interface SearchBrief { title: string; missing: string; why: string; steps: string[]; citation: string }
export interface SearchRecord {
  id: string; workspaceId: string; locationId: string; gap: SearchGap;
  brief: Record<PrototypeLocale, SearchBrief> | null; createdAt: string;
  approvedAt: string | null; actionId: string | null;
}

const countryFor = (market: string) => market === "hk" ? "hkg" : market === "tw" ? "twn" : null;
// Han alone cannot identify a language. Reject explicit Japanese/Korean script
// before treating a query as a candidate for this conservative Chinese heuristic.
const localQuery = (title: string) => /\p{Script=Han}/u.test(title) && !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(title);
const sufficient = (row: ContextItem) => Boolean(row.title.trim()) && Number.isFinite(row.metrics?.impressions) && (row.metrics?.impressions ?? 0) >= 20;

// GSC ties have arbitrary order. Preserve exact query identity rather than
// locale collation, which can consider distinct Unicode titles equal.
export const compareQueryTitles = (a: ContextItem, b: ContextItem) => a.title < b.title ? -1 : a.title > b.title ? 1 : 0;

/** A review heuristic, never proof of missing pages, ranking opportunity or a local win. */
export function buildSearchGap(input: { market: string; websiteUrl: string | null; requestedAt: string; source: ConnectorContext }): SearchGap {
  const gap: SearchGap = { version: 1, ...input, status: "unavailable", reason: "source_unavailable", queries: [] };
  const { source, market } = input;
  if (source.status === "failed") return { ...gap, status: "failed" };
  if (!["ready", "partial", "empty"].includes(source.status)) return gap;
  if (source.source !== "gsc" || !source.observedAt || !countryFor(market) || source.analytics?.country !== countryFor(market)) return { ...gap, reason: "coverage_missing" };
  if (!source.items.length) return { ...gap, status: "empty", reason: "thin" };
  const substantial = source.items.filter(sufficient);
  if (!substantial.length) return { ...gap, status: "partial", reason: "thin" };
  const local = substantial.filter(row => localQuery(row.title));
  if (!local.length) return { ...gap, status: "partial", reason: "language_limited" };
  const queries = local.filter(row => row.metrics?.clicks === 0).sort(compareQueryTitles).slice(0, 5);
  if (!queries.length) return { ...gap, status: "empty", reason: "no_review_queries" };
  return { ...gap, queries, status: source.status === "partial" || local.length !== substantial.length ? "partial" : "ready", reason: "review_queries" };
}

/** Stored with the gap, so copy changes and later chat cannot rewrite a confirmed brief. */
export function buildSearchBriefs(gap: SearchGap): SearchRecord["brief"] {
  if (!gap.queries.length) return null;
  const result = {} as Record<PrototypeLocale, SearchBrief>;
  for (const locale of ["en", "zh-HK", "zh-TW"] as const) {
    const t = searchCopy[locale];
    result[locale] = { title: t.briefTitle, missing: t.missing, why: t.why, steps: [t.stepReview, t.stepFacts, t.stepDraft], citation: `Google Search Console · ${gap.websiteUrl} · ${gap.source.scope} · ${gap.source.analytics!.country} · ${gap.source.analytics!.startDate} – ${gap.source.analytics!.endDate} · PT · ${gap.source.observedAt}` };
  }
  return result;
}

export type Observation = {
  status: "empty" | "partial" | "ready";
  reason: "approval_required" | "baseline_missing" | "later_window_required" | "coverage_changed" | "query_missing" | "comparable";
  baseline?: { startDate: string; endDate: string };
  later?: { startDate: string; endDate: string };
  rows: Array<{ query: string; beforeClicks: number; afterClicks: number; beforeImpressions: number; afterImpressions: number }>;
};
const day = (date: string) => Date.parse(`${date}T00:00:00Z`);
const days = (window: { startDate: string; endDate: string }) => (day(window.endDate) - day(window.startDate)) / 86_400_000 + 1;

/** Read-only association for the exact approved queries, never whole-site lift or attribution. */
export function observeSearch(record: SearchRecord, later: SearchGap): Observation {
  const empty: Observation = { status: "empty", reason: "baseline_missing", rows: [] };
  if (!record.approvedAt || !record.actionId) return { ...empty, reason: "approval_required" };
  const before = record.gap, a = before.source.analytics, b = later.source.analytics;
  if (!a || !record.brief || !before.queries.length || before.status !== "ready" || before.source.status !== "ready" || days(a) !== 28 || a.reportedDays !== 28) return empty;
  if (!b || later.source.status !== "ready" || before.websiteUrl !== later.websiteUrl || before.market !== later.market || before.source.scope !== later.source.scope || days(b) !== days(a)
    || a.country !== b.country || a.searchType !== b.searchType || a.dimensions !== b.dimensions || a.dataState !== b.dataState || a.aggregation !== b.aggregation || a.pageFilter !== b.pageFilter || a.rowLimit !== b.rowLimit || b.reportedDays !== 28) return { ...empty, status: "partial", reason: "coverage_changed" };
  // GSC dates are Pacific dates. The whole later window must start after confirmation.
  const approvedDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(record.approvedAt));
  if (day(b.startDate) <= day(a.endDate) || day(b.startDate) <= day(approvedDay)) return { ...empty, reason: "later_window_required" };
  const rows: Observation["rows"] = [];
  for (const query of before.queries) {
    const after = later.source.items.find(row => row.title === query.title);
    if (!after || !sufficient(after) || !Number.isFinite(after.metrics?.clicks)) return { ...empty, status: "partial", reason: "query_missing" };
    rows.push({ query: query.title, beforeClicks: query.metrics!.clicks, afterClicks: after.metrics!.clicks, beforeImpressions: query.metrics!.impressions, afterImpressions: after.metrics!.impressions });
  }
  return { status: "ready", reason: "comparable", baseline: a, later: b, rows };
}
