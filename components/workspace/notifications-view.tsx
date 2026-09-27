import { Bell, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { PageIntro, SectionCard } from "@/components/product-ui"
import { MyMailPreferencesForm, NotificationList, WorkspaceMailSwitchesForm } from "@/components/workspace/notifications-client"
import type { PrototypeLocale } from "@/lib/copy"
import { t } from "@/lib/i18n"
import type { MemberMailState, NotificationsModel } from "@/lib/workspace/queries-pages"

/** The note for every state except "open", which alone may say "we'll email you". */
const MAIL_STATE_NOTE: Record<Exclude<MemberMailState, "open">, string> = {
  closed: "mail.closedNote",
  paused: "mail.pausedNote",
  no_address: "mail.noAddress",
  not_allowlisted: "mail.limitedNote",
  none_on: "mail.offNote",
  blocked: "mail.gateNote",
}

/**
 * Email preferences (docs/superpowers/specs/2026-09-27-mail-outbox-design.md
 * §6): the "Allow these emails in this workspace" card is the owner-only
 * gate on `workspaces.notify_*` (global-constraints.md departure 2 --
 * disabled switches plus `mail.ownerOnly` for anyone else), and "My emails"
 * is every member's own opt-in on `workspace_members.mail_*`. Whether either
 * card's "we'll email you" note can render at all is `model.mailState`
 * (the member's one effective mail state); every other state shows the
 * honest note for why mail won't arrive instead. In-app rows come from
 * `workspace_notifications` for the signed-in member.
 */
export function NotificationsView({ locale, workspaceId, timezone, model }: { locale: PrototypeLocale; workspaceId: string; timezone: string; model: NotificationsModel }) {
  const isChinese = locale !== "en"
  const unread = model.inApp.filter((n) => !n.read_at).length
  const isOwner = model.role === "owner"
  // One note, from the one effective state computed server-side
  // (memberMailState in lib/workspace/queries-pages.ts). "We'll email you"
  // (mail.openNote) renders only when mailState is "open" -- at least one
  // kind both allowed by the workspace and switched on, with mail open,
  // unpaused, and an address the allowlist lets through.
  const address = model.myAddress ?? ""
  const mailNote = model.mailState === "open"
    ? <p className="limitation-note">{t(locale, "mail.openNote", { address })}</p>
    : <p className="limitation-note"><TriangleAlert /> {t(locale, MAIL_STATE_NOTE[model.mailState], { address })}</p>
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
          <MyMailPreferencesForm locale={locale} workspaceId={workspaceId} initial={model.myEmails} workspaceGates={{ rescanComplete: model.email.rescanComplete, regressionAlert: model.email.regressionAlert }} />
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
