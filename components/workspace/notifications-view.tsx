import Link from "next/link"
import { Bell, Check } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { PageIntro, SectionCard } from "@/components/product-ui"
import type { PrototypeLocale } from "@/lib/copy"
import { resolveText } from "@/lib/domain"
import { formatDateTime } from "@/lib/workspace/format"
import type { NotificationsModel } from "@/lib/workspace/queries-pages"

/**
 * Email preferences are read from `workspaces.notify_*`; the toggles are
 * rendered disabled until Phase 6 wires the PATCH route into this page. In-app
 * rows come from `workspace_notifications` for the signed-in member.
 */
export function NotificationsView({ locale, timezone, model }: { locale: PrototypeLocale; timezone: string; model: NotificationsModel }) {
  const isChinese = locale !== "en"
  const unread = model.inApp.filter((n) => !n.read_at).length
  return (
    <div className="settings-page notifications-page">
      <PageIntro eyebrow={isChinese ? "以同意為本的提示" : "Consent-led alerts"} title={isChinese ? "通知" : "Notifications"} description={isChinese ? "只保留有用營運訊號；類別、地點、渠道及靜音時段都可清楚控制。" : "Only useful operational signals, with explicit category, location, channel and quiet-hour controls."} />
      <div className="settings-grid">
        <SectionCard>
          <p className="eyebrow">Email</p>
          <h2>{isChinese ? "營運更新" : "Operational updates"}</h2>
          <div className="switch-list">
            <Label htmlFor="rescan-alert"><Switch id="rescan-alert" checked={model.email.rescanComplete} disabled /><span><strong>{isChinese ? "重新掃描完成" : "Rescan complete"}</strong><small>{isChinese ? "每次掃描完成後一封電郵" : "One email when a scan finishes"}</small></span></Label>
            <Label htmlFor="regression-alert"><Switch id="regression-alert" checked={model.email.regressionAlert} disabled /><span><strong>{isChinese ? "退步提示" : "Regression alert"}</strong><small>{isChinese ? "可比較掃描出現退步時" : "When a comparable scan regresses"}</small></span></Label>
            <Label htmlFor="monthly-digest"><Switch id="monthly-digest" checked={model.email.monthlyDigest} disabled /><span><strong>{isChinese ? "每月摘要" : "Monthly digest"}</strong><small>{isChinese ? "每月一次的成效摘要" : "A monthly summary of what changed"}</small></span></Label>
          </div>
          <p className="limitation-note"><Check /> {isChinese ? "偏好設定在第 6 階段接上後可以修改。" : "Editing these preferences is wired in Phase 6."}</p>
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
