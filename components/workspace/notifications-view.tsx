import Link from "next/link"
import { Bell, Check } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { PageIntro, SectionCard } from "@/components/product-ui"
import { NotificationPreferencesForm } from "@/components/workspace/notifications-client"
import type { PrototypeLocale } from "@/lib/copy"
import { resolveText } from "@/lib/domain"
import { formatDateTime } from "@/lib/workspace/format"
import type { NotificationsModel } from "@/lib/workspace/queries-pages"

/**
 * Email preferences are read from `workspaces.notify_*` and saved through the
 * copied PATCH route (Phase 6, any accepted member). In-app rows come from
 * `workspace_notifications` for the signed-in member.
 */
export function NotificationsView({ locale, workspaceId, timezone, model }: { locale: PrototypeLocale; workspaceId: string; timezone: string; model: NotificationsModel }) {
  const isChinese = locale !== "en"
  const unread = model.inApp.filter((n) => !n.read_at).length
  return (
    <div className="settings-page notifications-page">
      <PageIntro eyebrow={isChinese ? "以同意為本的提示" : "Consent-led alerts"} title={isChinese ? "通知" : "Notifications"} description={isChinese ? "只保留有用營運訊號；類別、地點、渠道及靜音時段都可清楚控制。" : "Only useful operational signals, with explicit category, location, channel and quiet-hour controls."} />
      <div className="settings-grid">
        <SectionCard>
          <p className="eyebrow">Email</p>
          <h2>{isChinese ? "營運更新" : "Operational updates"}</h2>
          <NotificationPreferencesForm locale={locale} workspaceId={workspaceId} initial={model.email} />
          <p className="limitation-note"><Check /> {isChinese ? "電郵只在你選擇的事件發生時寄出；應用內通知不受影響。" : "Emails are sent only for the events you choose; in-app notifications are unaffected."}</p>
        </SectionCard>
        <SectionCard>
          <div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "應用內" : "In-app"}</p><h2>{isChinese ? "通知" : "Notifications"}</h2></div><Badge variant="outline"><Bell /> {isChinese ? `${unread} 則未讀` : `${unread} unread`}</Badge></div>
          {model.inApp.length === 0 ? <p>{isChinese ? "尚未有通知。" : "No notifications yet."}</p> : (
            <div className="compact-action-list">
              {model.inApp.map((n) => {
                const body = <><div><strong>{resolveText(n.title, locale)}</strong><small>{n.body ? resolveText(n.body, locale) : ""} · {formatDateTime(n.created_at, locale, timezone)}</small></div></>
                return n.href ? <Link key={n.id} href={n.href} className={n.read_at ? "" : "is-unread"}>{body}</Link> : <div key={n.id} className={n.read_at ? "" : "is-unread"}>{body}</div>
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
