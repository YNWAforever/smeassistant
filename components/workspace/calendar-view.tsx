import Link from "next/link"
import { CalendarClock, MapPin, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { PageIntro, SectionCard } from "@/components/product-ui"
import type { PrototypeLocale } from "@/lib/copy"
import { resolveText } from "@/lib/domain"
import { formatDay, ordinal, priorityClass, priorityLabel, withLocation } from "@/lib/workspace/format"
import type { CalendarModel } from "@/lib/workspace/queries-pages"

/**
 * The rescan cadence comes from `scan_schedules` by place id; due items are
 * open actions with a `due_at`. No external publishing connector is claimed.
 *
 * The cadence is a reminder, not a promise: nothing in this app dispatches a
 * due `scan_schedules` row (no cron in vercel.json, no /api/cron route, no
 * `next_run_at <` query anywhere), and CLAUDE.md forbids adding a second
 * scheduler here. A rescan happens when the owner starts one.
 */
export function CalendarView({ locale, workspaceSlug, timezone, model }: { locale: PrototypeLocale; workspaceSlug: string; timezone: string; model: CalendarModel }) {
  const isChinese = locale !== "en"
  const base = `/${locale}/owner/${workspaceSlug}`
  return (
    <div className="calendar-page">
      <PageIntro eyebrow={isChinese ? "已規劃工作及監察" : "Planned work and monitoring"} title={isChinese ? "日曆" : "Calendar"} description={isChinese ? "所有日期都帶完整年份與狀態；目前沒有已驗證的外部發佈連接器。" : "Every item has a full date and explicit state; no external publishing connector is verified."} />
      <SectionCard className="calendar-card">
        <div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "監察節奏" : "Monitoring cadence"}</p><h2>{isChinese ? "重新掃描節奏" : "Rescan cadence"}</h2></div><Badge variant="outline">{isChinese ? "由你執行" : "You run these"}</Badge></div>
        {model.nextScans.length === 0 ? <p>{isChinese ? "尚未有節奏。付費方案在你首次重新掃描後，會在這裡記錄每月節奏。" : "No cadence yet. On the paid tier, your first rescan records a monthly cadence here."}</p> : (
          <ul className="calendar-list">
            {model.nextScans.map((scan) => <li key={scan.placeId}><span><CalendarClock /></span><div><strong>{scan.locationName ?? scan.placeId}</strong><small>{scan.cadence === "paused" ? (isChinese ? "已暫停" : "Paused") : scan.anniversaryDay ? (isChinese ? `每月 · 每月 ${scan.anniversaryDay} 號` : `Monthly · around the ${ordinal(scan.anniversaryDay)}`) : (isChinese ? "每月" : "Monthly")}</small></div><Link href={withLocation(`${base}/insights`, undefined)}>{isChinese ? "成效" : "Insights"}</Link></li>)}
          </ul>
        )}
        <p className="limitation-note"><TriangleAlert /> {isChinese ? "這是提示，不是自動排程：到期日不會自行觸發掃描，請在首頁或成效頁按「立即重新掃描」。" : "This is a reminder, not an automatic schedule: a due date never starts a scan on its own. Use “Rescan now” on Home or Insights."}</p>
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
