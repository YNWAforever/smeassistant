import { scanMetricsCopy } from "@/lib/copy";
import type { ReportProps } from "@/lib/funnel/report-props";
import type { MetricChange } from "@/lib/report/comparison/types";
import { comparisonCopy } from "@/lib/report/comparison/copy";
import { interpolate } from "@/lib/share";
import styles from "./dashboard.module.css";

function DateValue({ value, locale }: { value: string | null; locale: ReportProps["locale"] }) {
  if (!value || Number.isNaN(Date.parse(value))) return <span>{scanMetricsCopy[locale].dateUnavailable}</span>;
  return <time dateTime={value}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value))}</time>;
}
function CompactScope({ row, locale }: { row: MetricChange; locale: ReportProps["locale"] }) {
  const c = scanMetricsCopy[locale];
  const device = row.device === "mobile" || row.device === "desktop" ? c[row.device] : row.device;
  return <p className={styles.provenance}>{c.engine}: {row.engine} · {c.location}: {row.location} · {c.device}: {device}</p>;
}function Scope({ row, locale }: { row: MetricChange; locale: ReportProps["locale"] }) {
  const c = scanMetricsCopy[locale];
  const queryType = row.queryType === "discovery" || row.queryType === "branded" ? c[row.queryType] : row.queryType;
  const device = row.device === "mobile" || row.device === "desktop" ? c[row.device] : row.device;
  return <div className={styles.sourceContext}>
    <span>{c.engine}: {row.engine}</span><span>{c.queryType}: {queryType}</span><span>{c.gl}: {row.gl}</span>
    <span>{c.hl}: {row.hl}</span><span>{c.location}: {row.location}</span><span>{c.device}: {device}</span>
    {row.ll && <span>{c.ll}: {row.ll}</span>}
  </div>;
}
export function ScanComparisonPanel({ report }: { report: ReportProps }) {
  if (report.access === "public" || report.locked || !report.scanComparison) return null;
  const c = comparisonCopy[report.locale]; const metric = scanMetricsCopy[report.locale];
  const comparison = report.scanComparison;
  if (comparison.kind === "unavailable") return <section className={styles.scanComparison} aria-labelledby="scan-comparison-title">
    <h2 id="scan-comparison-title">{c.title}</h2><p className={styles.empty}>{c.unavailable[comparison.reason]}</p>
  </section>;
  const { changes } = comparison;
  const number = new Intl.NumberFormat(report.locale, { maximumFractionDigits: 1, signDisplay: "exceptZero" });
  const integer = new Intl.NumberFormat(report.locale);
  const directions = (["increased", "decreased", "unchanged"] as const);
  return <section className={styles.scanComparison} aria-labelledby="scan-comparison-title">
    <h2 id="scan-comparison-title">{c.title}</h2>
    <p className={styles.comparisonDates}><span>{c.previousScan}: <DateValue value={changes.previousScannedAt} locale={report.locale} /></span><span>{c.currentScan}: <DateValue value={changes.currentScannedAt} locale={report.locale} /></span></p>
    <dl className={styles.comparisonCounts}>{directions.map(direction => <div key={direction}><dt>{c[direction]}</dt><dd>{integer.format(changes.counts[direction])}</dd></div>)}</dl>
    {!changes.rows.length && <p className={styles.empty}>{c.noSearch}</p>}
    <div className={styles.comparisonGrid}>{changes.rows.map(row => <article className={styles.comparisonCard} data-direction={row.direction} key={row.key}>
      <h3>{metric[row.surface]}</h3><CompactScope row={row} locale={report.locale} />
      <p className={styles.comparisonValues}><span>{c.previous}: <strong>{integer.format(row.previous)}/{integer.format(row.denominator)}</strong></span><span>{c.current}: <strong>{integer.format(row.current)}/{integer.format(row.denominator)}</strong></span></p>
      <p><strong>{c[row.direction]}</strong> · {number.format(row.deltaPercentagePoints)} {c.percentagePoints}</p>
      {(row.omittedPrevious > 0 || row.omittedCurrent > 0) && <p className={styles.caption}>{interpolate(c.omitted, { n: integer.format(row.omittedPrevious), m: integer.format(row.omittedCurrent) })}</p>}
      <details className={styles.disclosure}><summary>{c.evidence}</summary><Scope row={row} locale={report.locale} /><ul>{row.evidence.map((fact, index) => <li key={index}><p>{fact.query}</p><p>{c.previous}: {fact.previous ? metric.present : metric.absent} · <DateValue value={fact.previousObservedAt} locale={report.locale} /></p><p>{c.current}: {fact.current ? metric.present : metric.absent} · <DateValue value={fact.currentObservedAt} locale={report.locale} /></p></li>)}</ul></details>
    </article>)}</div>
    {changes.ig && <article className={`${styles.comparisonCard} ${styles.sampleCoverage}`}><h3>{c.sampleCoverage}</h3><p className={styles.provenance}>{c.instagramSample}</p><p>{c.previous}: <strong>{interpolate(c.posts, { n: integer.format(changes.ig.previous) })}</strong> · {c.current}: <strong>{interpolate(c.posts, { n: integer.format(changes.ig.current) })}</strong> · {interpolate(c.posts, { n: number.format(changes.ig.delta) })}</p></article>}
    {changes.unavailableGroups > 0 && <p className={styles.caption}>{interpolate(c.unavailableGroups, { n: integer.format(changes.unavailableGroups) })}</p>}
  </section>;
}