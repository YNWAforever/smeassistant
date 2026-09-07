import { FactType, ProviderBadge } from "@/components/product-ui";
import { copy } from "@/lib/copy";
import type { DashboardMetric, ReportDashboard } from "@/lib/funnel/report-dashboard";
import type { ReportProps } from "@/lib/funnel/report-props";
import styles from "./dashboard.module.css";

function ObservationDate({ value, fallback }: { value?: string | null; fallback: string }) {
  return value && !Number.isNaN(Date.parse(value)) ? <time dateTime={value}>{value.slice(0, 10)}</time> : <span>{fallback}</span>;
}

export function DashboardMetrics({ report, dashboard }: { report: ReportProps; dashboard: ReportDashboard }) {
  if (report.access === "public" || report.locked) return null;
  const c = copy[report.locale].funnel.report;
  const d = c.dashboard;
  const number = new Intl.NumberFormat(report.locale);
  const unit = (metric: Extract<DashboardMetric, { state: "measured" }>) => metric.unit === "rating" ? "/ 5" : metric.unit === "percent" ? "%" : metric.key === "instagram-followers" ? d.followersUnit : metric.key === "google-reviews" ? d.reviewsUnit : d.countUnit;
  return <div className={styles.dashboard}>
    <section aria-labelledby="dashboard-statistics">
      <div className={styles.sectionHeading}><h2 id="dashboard-statistics">{d.statistics}</h2><FactType type="Observed" /></div>
      <div className={styles.metrics}>
        {dashboard.metrics.map(metric => {
          const sourceModule = report.modules.find(row => row.key === (metric.key.startsWith("instagram") ? "ig" : metric.key.startsWith("google") ? "gbp" : "aeo"));
          return <article key={metric.key} data-metric={metric.key} className={styles.metric}>
            <p className={styles.metricSource}>{metric.source}</p><h3>{metric.label}</h3>
            {metric.state === "measured" ? <><div className={styles.value}><strong>{number.format(metric.value)}</strong><span>{unit(metric)}</span></div>{metric.sampleSize != null && <p>{d.sampleSize}: {number.format(metric.sampleSize)}</p>}</> : <><p className={styles.unavailable}>{d.unavailable}</p><p className={styles.caption}>{metric.reason === d.unavailable ? d.unavailableReason : metric.reason}</p></>}
            <footer className={styles.provenance}><ObservationDate value={sourceModule?.observedAt} fallback={d.dateUnavailable} />{sourceModule && sourceModule.state !== "measured" && <ProviderBadge state={sourceModule.state} />}</footer>
          </article>;
        })}
      </div>
    </section>
    <div className={styles.benchmarks}>
      <section className={styles.panel} aria-labelledby="dashboard-rubric">
        <h2 id="dashboard-rubric">{d.rubric}</h2><p className={styles.caption}>{d.rubricNote}</p>
        {report.modules.map(module => <article className={styles.scoreRow} key={module.key}>
          <div className={styles.rowLabel}><h3>{module.label}</h3><ProviderBadge state={module.state} /></div>
          {module.state === "measured" && module.score != null ? <div className={styles.bar}><meter min={0} max={100} value={module.score} aria-label={`${module.label} · ${d.rubric}`} /><strong>{number.format(module.score)} / 100</strong></div> : <p className={styles.unavailable}>{d.unavailable}</p>}
          <p className={styles.provenance}><ObservationDate value={module.observedAt} fallback={d.dateUnavailable} /></p>
          {module.state !== "measured" && <p className={styles.caption}>{d.unavailableReason}</p>}
          {module.state === "measured" && module.detail && <p className={styles.caption}>{module.detail}</p>}
          {((module.state !== "measured" && module.detail) || module.limitationCode) && <details className={styles.disclosure}><summary>{d.details}</summary>{module.detail && <p>{module.detail}</p>}{module.limitationCode && <p>{module.limitationCode}</p>}</details>}
        </article>)}
      </section>
      <section className={styles.panel} aria-labelledby="dashboard-comparisons">
        <h2 id="dashboard-comparisons">{d.comparisons}</h2><p className={styles.caption}>{d.comparisonsNote}</p>
        {dashboard.comparisons.length === 0 ? <p className={styles.empty}>{d.noComparisons}</p> : dashboard.comparisons.map((group, index) => {
          const max = group.metric === "rating" ? 5 : Math.max(1, ...group.rows.map(row => row.value));
          const groupUnit = group.metric === "rating" ? "/ 5" : d.reviewsUnit;
          return <article className={styles.comparison} key={`${group.query}-${group.engine}-${group.metric}-${index}`}>
            <h3>{group.query}</h3><p className={styles.caption}>{group.source} · {group.engine}</p>
            <p className={styles.provenance}><ObservationDate value={group.observedAt} fallback={d.dateUnavailable} /> · {d.sampleSize}: {number.format(group.sampleSize)}</p>
            <p className={styles.metricSource}>{group.metric === "rating" ? c.proof.rating : c.proof.reviews}</p>
            {group.rows.map((row, rowIndex) => <div className={styles.comparisonRow} data-current={row.currentBusiness} key={`${row.name}-${rowIndex}`}>
              <div className={styles.rowLabel}><span>{row.name}</span>{row.currentBusiness && <span className={styles.chip}>{d.currentBusiness}</span>}</div>
              <div className={styles.bar}><meter min={0} max={max} value={row.value} aria-label={`${row.name} · ${group.metric === "rating" ? c.proof.rating : c.proof.reviews}`} /><strong>{number.format(row.value)} {groupUnit}</strong></div>
            </div>)}
          </article>;
        })}
      </section>
    </div>
  </div>;
}