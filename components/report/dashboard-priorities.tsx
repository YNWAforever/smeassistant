import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { copy } from "@/lib/copy";
import type { ReportProps } from "@/lib/funnel/report-props";
import styles from "./dashboard.module.css";

/**
 * "Do this first": the top supported priority as the lead card, then up to two
 * more. Ranks come from the loader (weighted impact) and are never re-numbered.
 * Locked previews show the label only and point at the unlock step.
 */
export function DashboardPriorities({ report }: { report: ReportProps }) {
  const c = copy[report.locale].funnel.report;
  const r = copy[report.locale].report;
  const authorized = report.access !== "public" && !report.locked;
  return <section className={styles.prioritySection} data-dashboard-priorities aria-labelledby="dashboard-priorities-title">
    <div className={styles.priorityHeading}><h2 id="dashboard-priorities-title">{r.doThisFirst}</h2><Badge variant="outline">{c.prioritiesRanked}</Badge></div>
    {!report.priorities.length ? <p className="limitations-box">{c.prioritiesEmpty}</p> : <div className={styles.priorities}>
      {report.priorities.slice(0, 3).map((priority, index) => {
        const href = report.locked?.unlockHref ?? (authorized && report.findingGroups.some(group => group.module === priority.module) ? `#report-detail-${priority.module}` : null);
        return <article key={priority.key} data-lead={index === 0 ? "true" : undefined}>
          <div className={styles.priorityMeta}><span className={styles.rank}>{String(priority.rank).padStart(2, "0")}</span><Badge variant="outline" className={`priority-${priority.tone}`}>{priority.severityLabel}</Badge><small>{priority.moduleLabel}</small></div>
          <h3>{priority.label}</h3>
          {authorized && (priority.action || priority.summary) && <p>{priority.action || priority.summary}</p>}
          {href && <Link href={href}>{report.locked ? c.unlockButton : c.evidenceLabel}<span aria-hidden="true"> →</span></Link>}
        </article>;
      })}
    </div>}
  </section>;
}
