import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { copy } from "@/lib/copy";
import type { ReportProps } from "@/lib/funnel/report-props";
import styles from "./dashboard.module.css";

export function DashboardPriorities({ report }: { report: ReportProps }) {
  const c = copy[report.locale].funnel.report;
  const authorized = report.access !== "public" && !report.locked;
  return <section className="report-section" data-dashboard-priorities aria-labelledby="dashboard-priorities-title">
    <div className="section-heading-inline"><div><p className="eyebrow">{c.prioritiesEyebrow}</p><h2 id="dashboard-priorities-title">{c.prioritiesTitle}</h2></div><Badge variant="outline">{c.prioritiesRanked}</Badge></div>
    {!report.priorities.length ? <p className="limitations-box">{c.prioritiesEmpty}</p> : <div className={styles.priorities}>
      {report.priorities.slice(0, 3).map(priority => {
        const href = report.locked?.unlockHref ?? (authorized && report.findingGroups.some(group => group.module === priority.module) ? `#report-detail-${priority.module}` : null);
        return <article key={priority.key}>
          <div className={styles.priorityMeta}><span className={styles.rank}>{String(priority.rank).padStart(2, "0")}</span><Badge variant="outline" className={`priority-${priority.tone}`}>{priority.severityLabel}</Badge></div>
          <h3>{priority.label}</h3>
          {authorized && (priority.action || priority.summary) && <p>{priority.action || priority.summary}</p>}
          {href && <Link href={href}>{report.locked ? c.unlockButton : c.evidenceLabel}<span aria-hidden="true"> →</span></Link>}
        </article>;
      })}
    </div>}
  </section>;
}