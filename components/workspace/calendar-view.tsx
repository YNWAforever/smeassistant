import Link from "next/link"
import { CalendarClock, MapPin } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { PageIntro, SectionCard } from "@/components/product-ui"
import type { PrototypeLocale } from "@/lib/copy"
import { resolveText } from "@/lib/domain"
import { formatDay, priorityClass, priorityLabel, withLocation } from "@/lib/workspace/format"
import type { CalendarModel } from "@/lib/workspace/queries-pages"

/**
 * Next scans come from `scan_schedules` by place id; due items are open
 * actions with a `due_at`. No external publishing connector is claimed.
 */
export function CalendarView({ locale, workspaceSlug, timezone, model }: { locale: PrototypeLocale; workspaceSlug: string; timezone: string; model: CalendarModel }) {
  const isChinese = locale !== "en"
  const base = `/${locale}/owner/${workspaceSlug}`
  return (
    <div className="calendar-page">
      <PageIntro eyebrow={isChinese ? "已規劃工作及監察" : "Planned work and monitoring"} title={isChinese ? "日曆" : "Calendar"} description={isChinese ? "所有日期都帶完整年份與狀態；目前沒有已驗證的外部發佈連接器。" : "Every item has a full date and explicit state; no external publishing connector is verified."} />
      <SectionCard className="calendar-card">
        <div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "監察排程" : "Monitoring schedule"}</p><h2>{isChinese ? "下次掃描" : "Next scans"}</h2></div></div>
        {model.nextScans.length === 0 ? <p>{isChinese ? "尚未有排程。付費方案的每月重新掃描會在這裡顯示。" : "No schedule yet. Monthly rescans on the paid tier appear here."}</p> : (
          <ul className="calendar-list">
            {model.nextScans.map((scan) => <li key={scan.placeId}><span><CalendarClock /></span><div><strong>{scan.locationName ?? scan.placeId}</strong><small>{scan.cadence === "paused" ? (isChinese ? "已暫停" : "Paused") : `${isChinese ? "每月" : "Monthly"} · ${formatDay(scan.nextRunAt, locale, timezone)}`}</small></div><Link href={withLocation(`${base}/insights`, undefined)}>{isChinese ? "成效" : "Insights"}</Link></li>)}
          </ul>
        )}
      </SectionCard>
      <SectionCard>
        <div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "有到期日的行動" : "Actions with a due date"}</p><h2>{isChinese ? "已規劃工作" : "Planned work"}</h2></div><Badge variant="outline">{model.dueActions.length}</Badge></div>
        {model.dueActions.length === 0 ? <p>{isChinese ? "尚未有行動設定到期日。" : "No action has a due date yet."}</p> : (
          <div className="compact-action-list">
            {model.dueActions.map((action) => <Link key={action.id} href={withLocation(`${base}/actions/${action.id}`, action.location.slug === "all" ? undefined : action.location.slug)}><span className={`priority-marker ${priorityClass(action.priority)}`} /><div><strong>{resolveText(action.title, locale)}</strong><small><MapPin /> {resolveText(action.location.name, locale)} · {formatDay(action.dueAt ?? null, locale, timezone)} · {priorityLabel(action.priority, locale)}</small></div></Link>)}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
