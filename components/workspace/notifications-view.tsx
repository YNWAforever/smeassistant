import { Bell, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { CapabilityBadge, PageIntro, SectionCard } from "@/components/product-ui"
import { NotificationList, NotificationPreferencesForm } from "@/components/workspace/notifications-client"
import type { PrototypeLocale } from "@/lib/copy"
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
      {/* The description used to advertise location, channel and quiet-hour
          controls. Only the three category switches exist, so it now names
          what is actually on the page. */}
      <PageIntro eyebrow={isChinese ? "以同意為本的提示" : "Consent-led alerts"} title={isChinese ? "通知" : "Notifications"} description={isChinese ? "只保留有用營運訊號。你可以按類別選擇，並在下方查看工作台的應用內通知。" : "Only useful operational signals. Choose them by category, and read this workspace's in-app notifications alongside."} />
      <div className="settings-grid">
        <SectionCard>
          <div className="section-card-heading"><div><p className="eyebrow">Email</p><h2>{isChinese ? "營運更新" : "Operational updates"}</h2></div><CapabilityBadge value="Planned" /></div>
          <NotificationPreferencesForm locale={locale} workspaceId={workspaceId} initial={model.email} />
          {/* No mail sender exists in this app and `notification_events` has no
              writer, so the three switches record a preference and nothing
              more. Saying so is the honest form of the promise this card used
              to make ("Emails are sent only for the events you choose"). */}
          <p className="limitation-note"><TriangleAlert /> {isChinese ? "電郵發送尚未啟用：這裡的選擇會儲存為偏好設定，但暫時不會寄出任何電郵。目前的即時渠道是旁邊的應用內通知。" : "Email delivery is not enabled yet: these choices are saved as preferences, but no email is sent. In-app notifications, shown alongside, are the live channel today."}</p>
        </SectionCard>
        <SectionCard>
          <div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "應用內" : "In-app"}</p><h2>{isChinese ? "通知" : "Notifications"}</h2></div><Badge variant="outline"><Bell /> {isChinese ? `${unread} 則未讀` : `${unread} unread`}</Badge></div>
          <NotificationList locale={locale} workspaceId={workspaceId} timezone={timezone} rows={model.inApp} />
        </SectionCard>
      </div>
    </div>
  )
}
