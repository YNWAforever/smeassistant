import Link from "next/link";
import { DemoBadge, FactType, ScoreDial } from "@/components/product-ui";
import { Badge } from "@/components/ui/badge";
import { copy } from "@/lib/copy";
import type { ReportProps } from "@/lib/funnel/report-props";
import { interpolate } from "@/lib/share";
import styles from "./dashboard.module.css";
import { ScanComparisonPanel } from "./scan-comparison";
import { comparisonCopy } from "@/lib/report/comparison/copy";

export function DashboardSummary({ report }: { report: ReportProps }) {
  const c = copy[report.locale].funnel.report;
  const d = c.dashboard;
  const comparisonC = comparisonCopy[report.locale];
  const { comparison, score } = report;
  const failed = report.status === "failed";
  const measured = report.modules.filter(module => module.state === "measured").length;
  const accessNote = report.sample ? c.sampleNote : report.access === "member" ? c.memberNote : ["viewer", "staff"].includes(report.access) ? c.viewerNote : null;
  const subtitle = report.subtitle ?? [report.market === "tw" ? c.marketTW : c.marketHK, report.district, report.industry].filter(Boolean).join(" · ");
  const title = failed ? c.failedTitle : score == null ? c.withheldTitle : comparison.kind === "comparable" ? comparison.title : comparison.kind === "incomparable" ? c.comparisonLabel : comparison.kind === "not_evaluated" ? comparisonC.currentReportTitle : c.firstScanTitle;
  const body = failed ? c.failedBody : score == null ? c.withheldBody : comparison.kind === "comparable" ? comparison.body : comparison.kind === "incomparable" ? comparison.reason : comparison.kind === "not_evaluated" ? comparisonC.currentReportBody : c.firstScanBody;
  const scanDate = report.scannedAt && !Number.isNaN(Date.parse(report.scannedAt)) ? report.scannedAt : null;
  const summary = report.access !== "public" && !report.locked ? report.summary : null;
  return <section className={styles.summary} aria-labelledby="dashboard-title">
    <header className={styles.titleRow}>
      <div>
        <div className={styles.badges}>
          <Badge variant="outline">{report.sample ? c.sampleBadge : report.locked || report.access === "public" ? c.previewBadge : c.fullBadge}</Badge>
          {report.sample && <DemoBadge locale={report.locale} />}
          {failed ? <Badge variant="outline">{c.failedBadge}</Badge> : (report.status === "partial" || (report.coverage != null && report.coverage < 100)) && <Badge variant="outline">{c.partialBadge}</Badge>}
        </div>
        <h1 id="dashboard-title">{interpolate(c.title, { business: report.businessName })}</h1>
        <p>{subtitle}</p>
        {accessNote && <small>{accessNote}</small>}
      </div>
      <p className={styles.scanDate}>{d.scanned}<br />{scanDate ? <time dateTime={scanDate}>{scanDate.slice(0, 10)}</time> : d.dateUnavailable}</p>
    </header>
    <ScanComparisonPanel report={report} />
    <div className={styles.health}>
      <div className={styles.dial}>
        {score == null ? <div className={styles.withheld}><strong>{c.notScored}</strong></div> : <ScoreDial score={score} coverage={report.coverage} {...(comparison.kind === "comparable" ? { delta: comparison.delta } : {})} />}
        <span className={styles.caption}>{d.rubric}</span>
      </div>
      <div className={styles.takeaway}>
        <FactType type={score == null ? "Unknown" : "Observed"} />
        <h2>{title}</h2><p>{body}</p>
        {comparison.kind === "first_scan" && <span className={styles.chip}>{c.firstScan}</span>}
        {comparison.kind === "incomparable" && (failed || score == null) && <p className={styles.notice}>{c.comparisonLabel}: {comparison.reason}</p>}
        <dl className={styles.coverage}>
          <div><dt>{copy[report.locale].common.coverage}</dt><dd>{report.coverage == null ? d.coverageUnavailable : `${new Intl.NumberFormat(report.locale).format(report.coverage)}%`}</dd></div>
          <div><dt>{c.measuredLabel}</dt><dd>{interpolate(c.sourceCount, { count: measured })}</dd></div>
          <div><dt>{c.unavailableLabel}</dt><dd>{interpolate(c.sourceCount, { count: report.modules.length - measured })}</dd></div>
        </dl>
        <Link href={`/${report.locale}/methodology`}>{c.howMeasured} →</Link>
      </div>
    </div>
    {summary && (summary.length > 240 ? <details className={styles.disclosure}><summary>{d.summary}</summary><FactType type="Inference" /><p>{summary}</p></details> : <div className={styles.interpretation}><FactType type="Inference" /><p>{summary}</p></div>)}
    {/* The claim hand-off. An unlocked report proves the reader has this
        device's viewer grant, not that they manage the business -- so this
        only offers the sign-in step, where ownership is actually verified
        (guardrail 15). Members already have a workspace, and the demo/sample
        surfaces must never link into a real claim. */}
    {!report.sample && report.access === "viewer" && report.slug && (
      <aside className={styles.claim}>
        <FactType type="Unknown" />
        <div>
          <h2>{c.claimTitle}</h2>
          <p>{c.claimBody}</p>
        </div>
        <Link href={`/${report.locale}/owner/sign-in?claim=${encodeURIComponent(report.slug)}`}>{c.claimCta} →</Link>
      </aside>
    )}
  </section>;
}