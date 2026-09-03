import { ShieldAlert, UserCheck, UserCog, UserRound } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageIntro, SectionCard } from "@/components/product-ui"
import { InviteMemberSheet, MemberRoleSelect, MemberScopeControl, RemoveMemberButton } from "@/components/workspace/team-client"
import type { PrototypeLocale } from "@/lib/copy"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import { formatDay } from "@/lib/workspace/format"
import { roleLabel } from "@/lib/workspace/shell"
import type { TeamModel } from "@/lib/workspace/team"

/**
 * Team & permissions (CLAUDE.md §3.1 `settings/team`, §3.9, Phase 6 item 5):
 * the prototype `TeamPage` layout bound to `getTeam`. The real role drives the
 * UI — no "preview as" select: owners get the invite sheet, role switch,
 * location-scope multi-select and remove dialog; managers and viewers see the
 * read-only table behind the prototype's permission banner.
 */
export function TeamView({ locale, workspaceId, role, timezone, model }: { locale: PrototypeLocale; workspaceId: string; role: WorkspaceRole; timezone: string; model: TeamModel }) {
  const isChinese = locale !== "en"
  const owner = role === "owner"
  const locations = model.locations.map((l) => ({ id: l.id, name: l.name }))
  const locationName = new Map(locations.map((l) => [l.id, l.name]))
  const allLocations = isChinese ? (locale === "zh-TW" ? "所有據點" : "所有地點") : "All locations"
  const yes = isChinese ? "是" : "Yes"
  const no = isChinese ? "否" : "No"
  const scopeText = (scope: string[] | null) => (scope === null ? allLocations : scope.map((id) => locationName.get(id) ?? id).join(" · ") || allLocations)

  return (
    <div className="settings-page team-page">
      <PageIntro
        eyebrow={isChinese ? "成員、角色及地點權限" : "Membership, role and location scope"}
        title={isChinese ? "團隊與權限" : "Team & permissions"}
        description={isChinese ? "介面只解釋能力；伺服器端授權才是執行邊界。" : "The interface explains capability; server-side authorization remains the enforcement boundary."}
        actions={owner ? <InviteMemberSheet locale={locale} workspaceId={workspaceId} /> : null}
      />
      {!owner && (
        <div className="permission-banner"><ShieldAlert /><div><strong>{isChinese ? `${roleLabel(role, locale)}權限` : `${roleLabel(role, locale)} access`}</strong><span>{role === "viewer" ? (isChinese ? "只可查看證據及成效；成員管理會安全拒絕。" : "Evidence and outcomes only; membership changes fail closed.") : (isChinese ? "可在分配地點準備及審批內容，但不能管理帳單或成員。" : "Prepare and approve in assigned locations; no billing or membership changes.")}</span></div><Badge variant="outline">{isChinese ? "拒絕操作" : "Fail closed"}</Badge></div>
      )}
      <SectionCard className="team-table-card">
        <Table>
          <TableCaption>{isChinese ? "顧問、分店經理與內容審批人等進階角色仍屬規劃中。" : "Advanced consultant, branch-manager and content-approver roles remain planned."}</TableCaption>
          <TableHeader><TableRow><TableHead>{isChinese ? "成員" : "Member"}</TableHead><TableHead>{isChinese ? "角色" : "Role"}</TableHead><TableHead>{isChinese ? "地點範圍" : "Location scope"}</TableHead><TableHead>{isChinese ? "帳單" : "Billing"}</TableHead><TableHead>{isChinese ? "審批" : "Approve"}</TableHead>{owner && <TableHead><span className="sr-only">{isChinese ? "操作" : "Actions"}</span></TableHead>}</TableRow></TableHeader>
          <TableBody>
            {model.members.length === 0 && <TableRow><TableCell colSpan={owner ? 6 : 5}>{isChinese ? "尚未有成員。" : "No members yet."}</TableCell></TableRow>}
            {model.members.map((member) => {
              const pending = !member.acceptedAt
              const editable = owner && member.role !== "owner"
              return (
                <TableRow key={member.id}>
                  <TableCell><div className="member-cell"><span>{member.email.slice(0, 1).toUpperCase()}</span><div><strong>{member.email}</strong><small>{pending ? (isChinese ? `邀請待接受 · ${member.invitedAt ? formatDay(member.invitedAt, locale, timezone) : ""}` : `Invite pending · ${member.invitedAt ? formatDay(member.invitedAt, locale, timezone) : ""}`) : (isChinese ? `已加入 · ${formatDay(member.acceptedAt!, locale, timezone)}` : `Joined · ${formatDay(member.acceptedAt!, locale, timezone)}`)}</small></div></div></TableCell>
                  <TableCell>{editable && member.role !== "owner" ? <MemberRoleSelect locale={locale} workspaceId={workspaceId} memberId={member.id} role={member.role} /> : <Badge variant="outline">{roleLabel(member.role, locale)}</Badge>}</TableCell>
                  <TableCell>{editable && member.role === "manager" ? <MemberScopeControl locale={locale} workspaceId={workspaceId} memberId={member.id} locations={locations} scope={member.locationScope} /> : member.role === "manager" ? scopeText(member.locationScope) : allLocations}</TableCell>
                  <TableCell>{member.role === "owner" ? yes : no}</TableCell>
                  <TableCell>{member.role === "viewer" ? no : yes}</TableCell>
                  {owner && <TableCell>{editable && <RemoveMemberButton locale={locale} workspaceId={workspaceId} memberId={member.id} email={member.email} />}</TableCell>}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </SectionCard>
      <div className="role-contract-grid">
        <SectionCard><UserCheck /><h2>{roleLabel("owner", locale)}</h2><p>{isChinese ? "管理認領、帳單、成員、所有地點及審批。" : "Claim, billing, members, all locations and approvals."}</p></SectionCard>
        <SectionCard><UserCog /><h2>{roleLabel("manager", locale)}</h2><p>{isChinese ? "只在獲分配地點生成、編輯及審批。" : "Generate, edit and approve only in assigned locations."}</p></SectionCard>
        <SectionCard><UserRound /><h2>{roleLabel("viewer", locale)}</h2><p>{isChinese ? "只看證據、趨勢及成效。" : "Evidence, trends and outcomes only."}</p></SectionCard>
      </div>
    </div>
  )
}
