import type { PrototypeLocale } from "@/lib/copy";
import { localized, type FactType, type LocalizedText } from "@/lib/domain";
import type { EvidenceReference } from "@/lib/pocket-assistant/contracts";
import { metricLabel } from "@/lib/workspace/format";
import { METRIC_KEYS, type MetricKey } from "@/lib/workspace/metrics";
import type { ActionOverview } from "@/lib/workspace/overview";
import type { ScanDiffRow, SnapshotRecord } from "@/lib/workspace/snapshots";

/**
 * Evidence references for the live assistant (CLAUDE.md §3.8, §3.5). Every
 * reference points at a real `scan_snapshots` row: the id is
 * `ev_<snapshotId>_<metricKey>`, the scan is the snapshot's job, and the fact
 * type follows §3.5 — measured metrics are Observed, a composite change is
 * Observed only when scan_diffs says the pair is comparable and the delta was
 * not withheld, otherwise Unknown. Nothing here estimates or aggregates.
 */
export interface BuildEvidenceInput {
  snapshot: SnapshotRecord;
  diff?: ScanDiffRow | null;
  /** The base of the comparison, when `snapshot.comparableTo` resolved. */
  base?: SnapshotRecord | null;
  action?: ActionOverview | null;
  locationName: string;
  locale: PrototypeLocale;
}

export type ModuleKey = "google_business" | "instagram" | "search_ai" | "website";

export const MODULE_NAMES: Record<ModuleKey, LocalizedText> = {
  google_business: localized("Google Business", "Google 商戶", "Google 商家"),
  instagram: localized("Instagram", "Instagram"),
  search_ai: localized("Search & AI surfaces", "搜尋與 AI 版面"),
  website: localized("Website", "網站"),
};

const COMPOSITE_LABEL = localized("Composite score change", "綜合評分變化");
const SCORE_LABEL = localized("Visibility score", "能見度評分");
const COVERAGE_LABEL = localized("Measured coverage", "已量度覆蓋率");
const SCANNER = localized("SME Scanner", "SME Scanner");
const YES = localized("yes", "是");
const NO = localized("no", "否");
const WITHHELD = localized("withheld", "已保留");
const NOT_COMPARABLE = localized("not comparable", "不可比較");
const NO_BASE = localized("no earlier comparable scan", "沒有較早的可比較掃描");

/** §3.5 fact types narrowed to what EvidenceReference carries: Attributed/Estimated read as Inference. */
export function refFactType(factType: FactType): EvidenceReference["factType"] {
  return factType === "Attributed" || factType === "Estimated" ? "Inference" : factType;
}

export function evidenceId(snapshotId: string, key: string): string {
  return `ev_${snapshotId}_${key}`;
}

export function moduleOfMetric(key: MetricKey): ModuleKey {
  if (key.startsWith("gbp.")) return "google_business";
  if (key.startsWith("ig.")) return "instagram";
  if (key.startsWith("aeo.")) return "search_ai";
  return "website";
}

/** Metric key → module name as scan_diffs.intersection_modules spells it. */
export function diffModuleOfMetric(key: MetricKey): string {
  const mod = moduleOfMetric(key);
  return mod === "google_business" ? "gbp" : mod === "instagram" ? "ig" : mod === "search_ai" ? "aeo" : "website";
}

/** Numbers as the workspace pages show them: rates as %, ratings to one decimal, flags as yes/no, counts as integers. */
export function formatMetricValue(key: MetricKey, value: number, locale: PrototypeLocale): string {
  if (key.endsWith("_pct")) return `${Math.round(value)}%`;
  if (key.endsWith("_rate")) return `${Math.round(value <= 1 ? value * 100 : value)}%`;
  if (key === "gbp.rating") return value.toFixed(1);
  if (key === "gbp.hours_complete" || key === "website.has_faq_schema") return (value ? YES : NO)[locale];
  if (key === "ig.avg_engagement") return Number.isInteger(value) ? String(value) : value.toFixed(1);
  return String(Math.round(value));
}

export function formatCoverage(coverage: number): string {
  return `${Math.round(coverage <= 1 ? coverage * 100 : coverage)}%`;
}

export function formatScore(score: number | null, locale: PrototypeLocale): string {
  return score === null ? WITHHELD[locale] : `${Math.round(score)}/100`;
}

/** Ordered metric keys present on the snapshot. */
export function measuredMetricKeys(snapshot: SnapshotRecord): MetricKey[] {
  return METRIC_KEYS.filter((key) => typeof snapshot.metrics[key] === "number");
}

export interface MetricChange {
  key: MetricKey;
  before: number | null;
  after: number;
  delta: number | null;
  factType: FactType;
}

/**
 * Before/after for one metric. The delta is Observed only when the diff is
 * comparable and the metric's module is in `intersection_modules` (§3.5.3);
 * otherwise it is Unknown and the delta is null.
 */
export function metricChange(key: MetricKey, snapshot: SnapshotRecord, base: SnapshotRecord | null | undefined, diff: ScanDiffRow | null | undefined): MetricChange | null {
  const after = snapshot.metrics[key];
  if (typeof after !== "number") return null;
  const before = typeof base?.metrics[key] === "number" ? (base.metrics[key] as number) : null;
  const comparable = Boolean(diff?.comparable) && (diff?.intersection_modules ?? []).includes(diffModuleOfMetric(key));
  if (before === null || !comparable) return { key, before, after, delta: null, factType: "Unknown" };
  return { key, before, after, delta: Number((after - before).toFixed(2)), factType: "Observed" };
}

export function compositeFactType(diff: ScanDiffRow | null | undefined): FactType {
  if (!diff || !diff.comparable || diff.composite_withheld_reason) return "Unknown";
  return "Observed";
}

function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function compositeValue(diff: ScanDiffRow | null | undefined, locale: PrototypeLocale): string {
  if (!diff) return NO_BASE[locale];
  const base = num(diff.composite_base);
  const head = num(diff.composite_head);
  if (!diff.comparable) return `${NOT_COMPARABLE[locale]} · ${diff.incomparable_reason ?? "UNKNOWN"}`;
  if (diff.composite_withheld_reason) return `${WITHHELD[locale]} · ${diff.composite_withheld_reason}`;
  const delta = num(diff.composite_delta);
  const sign = delta === null ? "" : delta > 0 ? "+" : "";
  return `${base === null ? "—" : Math.round(base)} → ${head === null ? "—" : Math.round(head)}${delta === null ? "" : ` (${sign}${Math.round(delta)})`}`;
}

function source(module: LocalizedText, locationName: string, locale: PrototypeLocale): string {
  return `${module[locale]} · ${locationName}`;
}

/**
 * The references the sheet renders: score + coverage, every measured metric,
 * the composite change when a diff exists, and the focused action's own
 * evidence line. Order is stable so tests and snapshots can rely on it.
 */
export function buildEvidenceRefs(input: BuildEvidenceInput): EvidenceReference[] {
  const { snapshot, diff = null, action = null, locationName, locale } = input;
  const refs: EvidenceReference[] = [];
  const at = snapshot.observedAt;
  const scanner = source(SCANNER, locationName, locale);

  refs.push({
    evidenceId: evidenceId(snapshot.id, "score"),
    scanId: snapshot.jobId,
    factType: snapshot.overallScore === null ? "Unknown" : "Observed",
    label: SCORE_LABEL[locale],
    value: formatScore(snapshot.overallScore, locale),
    observedAt: at,
    source: scanner,
  });
  refs.push({
    evidenceId: evidenceId(snapshot.id, "coverage"),
    scanId: snapshot.jobId,
    factType: "Observed",
    label: COVERAGE_LABEL[locale],
    value: formatCoverage(snapshot.coverage),
    observedAt: at,
    source: scanner,
  });

  for (const key of measuredMetricKeys(snapshot)) {
    refs.push({
      evidenceId: evidenceId(snapshot.id, key),
      scanId: snapshot.jobId,
      factType: "Observed",
      label: metricLabel(key, locale),
      value: formatMetricValue(key, snapshot.metrics[key] as number, locale),
      observedAt: at,
      source: source(MODULE_NAMES[moduleOfMetric(key)], locationName, locale),
    });
  }

  if (diff) {
    refs.push({
      evidenceId: evidenceId(snapshot.id, "composite"),
      scanId: snapshot.jobId,
      factType: refFactType(compositeFactType(diff)),
      label: COMPOSITE_LABEL[locale],
      value: compositeValue(diff, locale),
      observedAt: at,
      source: scanner,
    });
  }

  if (action) {
    refs.push({
      evidenceId: evidenceId(snapshot.id, `action_${action.id}`),
      scanId: snapshot.jobId,
      factType: refFactType(action.evidence.factType),
      label: action.title[locale],
      value: action.evidence.value,
      observedAt: action.evidence.observedAt || at,
      source: action.evidence.source || scanner,
    });
  }

  return refs;
}

/** The subset of refs whose id ends with one of the given keys (score, coverage, a metric key, composite, action_<id>). */
export function pickRefs(refs: EvidenceReference[], snapshotId: string, keys: string[]): EvidenceReference[] {
  const wanted = new Set(keys.map((key) => evidenceId(snapshotId, key)));
  return refs.filter((ref) => wanted.has(ref.evidenceId));
}
