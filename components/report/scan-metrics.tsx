import { scanMetricsCopy } from "@/lib/copy";
import type { ReportProps } from "@/lib/funnel/report-props";
import type { Coverage, Exclusion } from "@/lib/report/scan-metrics/types";
import { interpolate } from "@/lib/share";
import styles from "./dashboard.module.css";

type MetricCopy = typeof scanMetricsCopy.en;
const reasons: Exclusion[] = ["unknown", "failed", "unsupported", "no_answer", "conflict", "unidentified"];
function RecordedDate({ value, fallback }: { value?: string | null; fallback: string }) {
 return value && !Number.isNaN(Date.parse(value)) ? <time dateTime={value}>{value.slice(0, 10)}</time> : <span>{fallback}</span>;
}
function SourceContext({ value, c }: { value: string; c: MetricCopy }) {
 let parsed: Record<string, unknown> = {};
 try { const result: unknown = JSON.parse(value); if (result && typeof result === "object" && !Array.isArray(result)) parsed = result as Record<string, unknown>; } catch { /* Older records may not have structured context. */ }
 const entries = (["gl", "hl", "location", "device", "ll"] as const).flatMap(key => {
  const entry = parsed[key];
  if (typeof entry !== "string" || !entry.trim()) return [];
  const label = key === "device" && (entry === "mobile" || entry === "desktop") ? c[entry] : entry;
  return [<span key={key}>{c[key]}: {label}</span>];
 });
 return <p className={styles.sourceContext}>{entries.length ? entries : c.contextUnavailable}</p>;
}
function CoverageNotes({ coverage, c, format }: { coverage: Coverage; c: MetricCopy; format: Intl.NumberFormat }) {
 const count = (template: string, n: number) => interpolate(template, { n: format.format(n) });
 return <div className={styles.caption}>
  <p>{count(c.inspected, coverage.inspected)} · {count(c.duplicates, coverage.duplicates)} · {count(c.excluded, reasons.reduce((sum, reason) => sum + coverage.excluded[reason], 0))}</p>
  {reasons.filter(reason => coverage.excluded[reason] > 0).map(reason => <p key={reason}>{c[reason]}: {format.format(coverage.excluded[reason])}</p>)}
  {coverage.truncated && <p>{c.incomplete}</p>}{coverage.evidenceTruncated && <p>{c.evidenceLimited}</p>}
 </div>;
}
export function ScanMetricsPanel({ report }: { report: ReportProps }) {
 if (report.access === "public" || report.locked || !report.scanMetrics) return null;
 const measured = (key: string) => report.modules.some(module => module.key === key && module.state === "measured");
 const ig = measured("ig") ? report.scanMetrics.instagram : null;
 const search = measured("aeo") ? report.scanMetrics.search : [];
 const omitted = measured("aeo") ? report.scanMetrics.omittedSearchGroups : 0;
 if (!ig && !search.length && !omitted) return null;
 const c = scanMetricsCopy[report.locale];
 const format = new Intl.NumberFormat(report.locale, { maximumFractionDigits: 1 });
 const count = (template: string, n: number) => interpolate(template, { n: format.format(n) });
 return <section className={styles.scanMetrics} aria-labelledby="scan-metrics-title">
  <h3 id="scan-metrics-title">{c.title}</h3>
  <p className={styles.provenance}>{c.scanned}: <RecordedDate value={report.scannedAt} fallback={c.scanUnavailable} /></p>
  {ig && <article className={styles.panel}>
   <h4>{c.instagram}</h4><p><strong>{count(c.posts, ig.distinctPosts)}</strong> · {count(c.dated, ig.datedPosts)}</p>
   <p>{c.span}: <RecordedDate value={ig.earliest} fallback={c.publicationUnavailable} />{ig.latest && ig.latest !== ig.earliest && <> – <RecordedDate value={ig.latest} fallback={c.publicationUnavailable} /></>}</p>
   <p className={styles.caption}>{c.historical}</p>
   <CoverageNotes coverage={ig.coverage} c={c} format={format} />
   <details className={styles.disclosure}><summary>{count(c.evidence, ig.observations.length)}</summary><p>{c.recorded}</p>
    <ul>{ig.observations.map((row, index) => <li key={index}>
     <p>{row.identity ?? c.unidentified}</p><p>{c.published}: <RecordedDate value={row.postedAt} fallback={c.publicationUnavailable} /></p>
     <p>{c.likes}: {row.likes === null ? c.missing : format.format(row.likes)} · {c.comments}: {row.comments === null ? c.missing : format.format(row.comments)}</p>
     {row.ambiguousZero && <p>{c.zero}</p>}
    </li>)}</ul>
   </details>
  </article>}
  {search.map((metric, index) => {
   const percent = metric.state === "measured" && metric.denominator > 0 ? format.format(100 * metric.numerator / metric.denominator) : null;
   const queryType = metric.queryType === "discovery" || metric.queryType === "branded" ? c[metric.queryType] : metric.queryType ?? c.queryTypeUnavailable;
   return <article className={styles.panel} key={index}>
    <h4>{c[metric.surface]}</h4><p className={styles.caption}>{c.scope}</p>
    <p className={styles.provenance}>{c.engine}: {metric.engine} · {c.queryType}: {queryType}</p><SourceContext value={metric.context} c={c} />
    {percent !== null ? <><p>{interpolate(c.appearances, { x: format.format(metric.numerator), n: format.format(metric.denominator) })}</p><div className={styles.bar}><meter min={0} max={metric.denominator} value={metric.numerator} aria-label={c[metric.surface]} /><strong>{percent}%</strong></div></> : <p className={styles.unavailable}>{c.unavailable}</p>}
    <p>{count(c.eligible, metric.denominator)}</p><CoverageNotes coverage={metric.coverage} c={c} format={format} />
    <details className={styles.disclosure}><summary>{count(c.evidence, metric.observations.length)}</summary>
     <ul>{metric.observations.map((row, rowIndex) => <li key={rowIndex}><p>{row.query}</p><p>{c[row.outcome]}</p><p>{c.observed}: <RecordedDate value={row.observedAt} fallback={c.dateUnavailable} /></p></li>)}</ul>
    </details>
   </article>;
  })}
  {omitted > 0 && <p className={styles.caption}>{count(c.omitted, omitted)}</p>}
 </section>;
}

