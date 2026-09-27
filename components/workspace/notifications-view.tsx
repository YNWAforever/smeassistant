import { Bell, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { PageIntro, SectionCard } from "@/components/product-ui"
import { MyMailPreferencesForm, NotificationList, WorkspaceMailSwitchesForm } from "@/components/workspace/notifications-client"
import type { PrototypeLocale } from "@/lib/copy"
import { t } from "@/lib/i18n"
import type { NotificationsModel } from "@/lib/workspace/queries-pages"

/**
 * Email preferences (docs/superpowers/specs/2026-09-27-mail-outbox-design.md
 * §6): the "Allow these emails in this workspace" card is the owner-only
 * gate on `workspaces.notify_*` (global-constraints.md departure 2 --
 * disabled switches plus `mail.ownerOnly` for anyone else), and "My emails"
 * is every member's own opt-in on `workspace_members.mail_*`. Whether either
 * card's "we'll email you" note can render at all is `model.mailOpen`
 * (`mailAvailability().open`); while mail is closed both cards show the
 * honest `mail.closedNote` instead. In-app rows come from
 * `workspace_notifications` for the signed-in member.
 */
export function NotificationsView({ locale, workspaceId, timezone, model }: { locale: PrototypeLocale; workspaceId: string; timezone: string; model: NotificationsModel }) {
  const isChinese = locale !== "en"
  const unread = model.inApp.filter((n) => !n.read_at).length
  const isOwner = model.role === "owner"
  const mailNote = model.mailOpen
    ? <p className="limitation-note">{t(locale, "mail.openNote", { address: model.myAddress ?? "" })}</p>
    : <p className="limitation-note"><TriangleAlert /> {t(locale, "mail.closedNote")}</p>
  return (
    <div className="settings-page notifications-page">
      <PageIntro eyebrow={isChinese ? "以同意為本的提示" : "Consent-led alerts"} title={isChinese ? "通知" : "Notifications"} description={isChinese ? "只保留有用營運訊號。你可以按類別選擇，並在下方查看工作台的應用內通知。" : "Only useful operational signals. Choose them by category, and read this workspace's in-app notifications alongside."} />
      <div className="settings-grid">
        <SectionCard>
          <div className="section-card-heading"><div><p className="eyebrow">Email</p><h2>{t(locale, "mail.allowTitle")}</h2></div></div>
          <WorkspaceMailSwitchesForm locale={locale} workspaceId={workspaceId} initial={model.email} disabled={!isOwner} />
          {!isOwner && <p className="limitation-note"><TriangleAlert /> {t(locale, "mail.ownerOnly")}</p>}
          {mailNote}
        </SectionCard>
        <SectionCard>
          <div className="section-card-heading"><div><p className="eyebrow">Email</p><h2>{t(locale, "mail.myEmailsTitle")}</h2></div></div>
          <MyMailPreferencesForm locale={locale} workspaceId={workspaceId} initial={model.myEmails} />
          {mailNote}
        </SectionCard>
        <SectionCard>
          <div className="section-card-heading"><div><p className="eyebrow">{isChinese ? "應用內" : "In-app"}</p><h2>{isChinese ? "通知" : "Notifications"}</h2></div><Badge variant="outline"><Bell /> {isChinese ? `${unread} 則未讀` : `${unread} unread`}</Badge></div>
          <NotificationList locale={locale} workspaceId={workspaceId} timezone={timezone} rows={model.inApp} />
        </SectionCard>
      </div>
    </div>
  )
}
