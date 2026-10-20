import { UserCheck, UserCog, UserRound } from "lucide-react"

import { RoleNotice } from "@/components/states/role-notice"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageIntro, SectionCard } from "@/components/product-ui"
import { InviteMemberSheet, MemberRoleSelect, MemberScopeControl, RemoveMemberButton, ResendInvitationButton } from "@/components/workspace/team-client"
import { copy, type PrototypeLocale } from "@/lib/copy"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import { formatDay } from "@/lib/workspace/format"
import { roleLabel } from "@/lib/workspace/shell"
import type { TeamMember, TeamModel } from "@/lib/workspace/team"
import { fill } from "@/lib/copy-ui"

const STATUS_COPY = {
  en: { emailed: "Invitation emailed", closed: "Email not sent: email isn't set up yet", allowlist: "Email not sent: recipient isn't on the test list", failed: "Email failed", expired: "Expired" },
  "zh-HK": { emailed: "已發出邀請電郵", closed: "未發出電郵：電郵功能尚未設定", allowlist: "未發出電郵：收件人不在測試名單", failed: "電郵發送失敗", expired: "已過期" },
  "zh-TW": { emailed: "已寄出邀請信", closed: "未寄出：電子郵件功能尚未設定", allowlist: "未寄出：收件人不在測試名單", failed: "寄送失敗", expired: "已過期" },
} as const satisfies Record<PrototypeLocale, Record<string, string>>

/** Invitation delivery line for a pending member; null when there is nothing to report. */
function invitationStatusText(member: TeamMember, locale: PrototypeLocale): string | null {
  const copy = STATUS_COPY[locale]
  if (member.expired) return copy.expired
  const attempt = member.invitation
  if (!attempt) return null
  if (attempt.status === "accepted_by_provider") return copy.emailed
  if (attempt.status === "failed") return copy.failed
  if (attempt.status === "not_configured") return attempt.error === "not_allowlisted" ? copy.allowlist : attempt.error === "mail_closed" ? copy.closed : null
  return null
}

/**
 * Team & permissions (CLAUDE.md §3.1 `settings/team`, §3.9, Phase 6 item 5):
 * the prototype `TeamPage` layout bound to `getTeam`. The real role drives the
 * UI — no "preview as" select: owners get the invite sheet, role switch,
 * location-scope multi-select and remove dialog; managers and viewers see the
 * read-only table behind the prototype's permission banner.
 */
export function TeamView({ locale, workspaceId, role, timezone, model, invitationMail = false }: { locale: PrototypeLocale; workspaceId: string; role: WorkspaceRole; timezone: string; model: TeamModel; invitationMail?: boolean }) {
  const pc = copy[locale].workspaceBusiness.team
  const owner = role === "owner"
  const locations = model.locations.map((l) => ({ id: l.id, name: l.name }))
  const locationName = new Map(locations.map((l) => [l.id, l.name]))
  const allLocations = pc.allLocations
  const yes = pc.yes
  const no = pc.no
  const scopeText = (scope: string[] | null) => (scope === null ? allLocations : scope.map((id) => locationName.get(id) ?? id).join(" · ") || allLocations)

  return (
    <div className="settings-page team-page">
      <PageIntro
        eyebrow={pc.membershipRoleAndLocation}
        title={pc.teamPermissions}
        description={pc.theInterfaceExplainsCapability}
        actions={owner ? <InviteMemberSheet locale={locale} workspaceId={workspaceId} /> : null}
      />
      {!owner && (
        <RoleNotice kind={role === "viewer" ? "teamViewer" : "teamManager"} role={role} locale={locale} />
      )}
      <SectionCard className="team-table-card">
        <Table>
          <TableCaption>{pc.advancedConsultantBranchManager}</TableCaption>
          <TableHeader><TableRow><TableHead>{pc.member}</TableHead><TableHead>{pc.role}</TableHead><TableHead>{pc.locationScope}</TableHead><TableHead>{pc.billing}</TableHead><TableHead>{pc.approve}</TableHead>{owner && <TableHead><span className="sr-only">{pc.actions}</span></TableHead>}</TableRow></TableHeader>
          <TableBody>
            {model.members.length === 0 && <TableRow><TableCell colSpan={owner ? 6 : 5}>{pc.noMembersYet}</TableCell></TableRow>}
            {model.members.map((member) => {
              const pending = !member.acceptedAt
              const editable = owner && member.role !== "owner"
              const statusText = invitationMail && pending ? invitationStatusText(member, locale) : null
              return (
                <TableRow key={member.id}>
                  <TableCell><div className="member-cell"><span>{member.email.slice(0, 1).toUpperCase()}</span><div><strong>{member.email}</strong><small>{pending ? (fill(pc.invitePending, { timezone: member.invitedAt ? formatDay(member.invitedAt, locale, timezone) : "" })) : (fill(pc.joined, { acceptedAt: formatDay(member.acceptedAt!, locale, timezone) }))}</small>{statusText && <small className="invitation-status">{statusText}</small>}</div></div></TableCell>
                  <TableCell>{editable && member.role !== "owner" ? <MemberRoleSelect locale={locale} workspaceId={workspaceId} memberId={member.id} role={member.role} /> : <Badge variant="outline">{roleLabel(member.role, locale)}</Badge>}</TableCell>
                  <TableCell>{editable && member.role === "manager" ? <MemberScopeControl locale={locale} workspaceId={workspaceId} memberId={member.id} locations={locations} scope={member.locationScope} /> : member.role === "manager" ? scopeText(member.locationScope) : allLocations}</TableCell>
                  <TableCell>{member.role === "owner" ? yes : no}</TableCell>
                  <TableCell>{member.role === "viewer" ? no : yes}</TableCell>
                  {owner && <TableCell>{editable && invitationMail && pending && <ResendInvitationButton locale={locale} workspaceId={workspaceId} memberId={member.id} />}{editable && <RemoveMemberButton locale={locale} workspaceId={workspaceId} memberId={member.id} email={member.email} />}</TableCell>}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </SectionCard>
      <div className="role-contract-grid">
        <SectionCard><UserCheck /><h2>{roleLabel("owner", locale)}</h2><p>{pc.claimBillingMembersAll}</p></SectionCard>
        <SectionCard><UserCog /><h2>{roleLabel("manager", locale)}</h2><p>{pc.generateEditAndApprove}</p></SectionCard>
        <SectionCard><UserRound /><h2>{roleLabel("viewer", locale)}</h2><p>{pc.evidenceTrendsAndOutcomes}</p></SectionCard>
      </div>
    </div>
  )
}
