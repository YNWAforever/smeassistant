import Link from "next/link"
import { CalendarClock, MapPin, TriangleAlert } from "lucide-react"

import { EmptyState } from "@/components/kinnso/states"
import { Badge } from "@/components/ui/badge"
import { PageIntro, SectionCard } from "@/components/product-ui"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { resolveText } from "@/lib/domain"
import { formatDay, ordinal, priorityClass, priorityLabel, withLocation } from "@/lib/workspace/format"
import type { CalendarModel } from "@/lib/workspace/queries-pages"
import { fill } from "@/lib/copy-ui"

/**
 * The rescan cadence comes from `scan_schedules` by place id; due items are
 * open actions with a `due_at`. No external publishing connector is claimed.
 *
 * The cadence is a reminder, not a promise: nothing in this app dispatches a
 * due `scan_schedules` row (no cron in vercel.json, no /api/cron route, no
 * `next_run_at <` query anywhere), and CLAUDE.md forbids adding a second
 * scheduler here. A rescan happens when the owner starts one.
 */
/** `embedded`: shown as the Due view inside the Actions queue frame, which supplies the header. */
export function CalendarView({ locale, workspaceSlug, timezone, model, embedded = false }: { locale: PrototypeLocale; workspaceSlug: string; timezone: string; model: CalendarModel; embedded?: boolean }) {
  const pc = copy[locale].workspaceHome.calendar
  const base = `/${locale}/owner/${workspaceSlug}`
  return (
    <div className="calendar-page">
      {!embedded && <PageIntro eyebrow={pc.plannedWorkAndMonitoring} title={pc.calendar} description={pc.everyItemHasA} />}
      <SectionCard className="calendar-card">
        <div className="section-card-heading"><div><p className="eyebrow">{pc.monitoringCadence}</p><h2>{pc.rescanCadence}</h2></div><Badge variant="outline">{pc.youRunThese}</Badge></div>
        {model.nextScans.length === 0 ? <p>{pc.noCadenceYetOn}</p> : (
          <ul className="calendar-list">
            {model.nextScans.map((scan) => <li key={scan.placeId}><span><CalendarClock /></span><div><strong>{scan.locationName ?? scan.placeId}</strong><small>{scan.cadence === "paused" ? pc.paused : scan.anniversaryDay ? fill(pc.monthlyAround, { day: scan.anniversaryDay, ordinal: ordinal(scan.anniversaryDay) }) : pc.monthly}</small></div><Link href={withLocation(`${base}/insights`, scan.locationSlug)}>{copy[locale].shell.nav.insights}</Link></li>)}
          </ul>
        )}
        <p className="limitation-note"><TriangleAlert /> {pc.thisIsAReminder}</p>
      </SectionCard>
      <SectionCard>
        <div className="section-card-heading"><div><p className="eyebrow">{pc.actionsWithADue}</p><h2>{pc.plannedWork}</h2></div><Badge variant="outline">{model.dueActions.length}</Badge></div>
        {model.dueActions.length === 0 ? <EmptyState locale={locale} kind="noData" title={copy[locale].shell.empty.due.title} body={copy[locale].shell.empty.due.body} /> : (
          <div className="compact-action-list">
            {model.dueActions.map((action) => <Link key={action.id} href={withLocation(`${base}/actions/${action.id}`, action.location.slug === "all" ? undefined : action.location.slug)}><span className={`priority-marker ${priorityClass(action.priority)}`} /><div><strong>{resolveText(action.title, locale)}</strong><small><MapPin /> {resolveText(action.location.name, locale)} · {formatDay(action.dueAt ?? null, locale, timezone)} · {priorityLabel(action.priority, locale)}</small></div></Link>)}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
