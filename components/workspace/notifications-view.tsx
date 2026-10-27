import { Bell, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { PageIntro, SectionCard } from "@/components/product-ui"
import { MyMailPreferencesForm, NotificationList, WorkspaceMailSwitchesForm } from "@/components/workspace/notifications-client"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { t } from "@/lib/i18n"
import type { MemberMailState, NotificationsModel } from "@/lib/workspace/queries-pages"
import { fill } from "@/lib/copy-ui"

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
  const pc = copy[locale].workspaceBusiness.notifications
  const unread = model.inApp.filter((n) => !n.read_at).length
  const isOwner = model.role === "owner"
  // One note, shown once under "My emails", from the one effective state computed server-side
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
      <PageIntro eyebrow={pc.consentLedAlerts} title={copy[locale].shell.notifications.label} description={pc.onlyUsefulOperationalSignals} />
      <div className="settings-grid">
        <SectionCard>
          <div className="section-card-heading"><div><p className="eyebrow">{t(locale, "mail.eyebrow")}</p><h2>{t(locale, "mail.allowTitle")}</h2></div></div>
          <WorkspaceMailSwitchesForm locale={locale} workspaceId={workspaceId} initial={model.email} disabled={!isOwner} />
          {!isOwner && <p className="limitation-note"><TriangleAlert /> {t(locale, "mail.ownerOnly")}</p>}
        </SectionCard>
        <SectionCard>
          <div className="section-card-heading"><div><p className="eyebrow">{t(locale, "mail.eyebrow")}</p><h2>{t(locale, "mail.myEmailsTitle")}</h2></div></div>
          <MyMailPreferencesForm locale={locale} workspaceId={workspaceId} initial={model.myEmails} workspaceGates={{ rescanComplete: model.email.rescanComplete, regressionAlert: model.email.regressionAlert }} />
          {mailNote}
        </SectionCard>
        <SectionCard>
          <div className="section-card-heading"><div><p className="eyebrow">{pc.inApp}</p><h2>{copy[locale].shell.notifications.label}</h2></div><Badge variant="outline"><Bell /> {fill(pc.unread, { unread })}</Badge></div>
          <NotificationList locale={locale} workspaceId={workspaceId} timezone={timezone} rows={model.inApp} />
        </SectionCard>
      </div>
    </div>
  )
}
