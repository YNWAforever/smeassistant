import { Lock, ShieldAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import { roleLabel } from "@/lib/workspace/shell"

export type RoleNoticeKind =
  | "viewer" | "viewerAction" | "viewerAssets" | "outOfScope" | "createReadOnly"
  | "brand" | "billing" | "teamViewer" | "teamManager" | "forbidden" | "notMember"

const OWNER_ONLY = new Set<RoleNoticeKind>(["brand", "billing", "teamViewer", "teamManager"])

/**
 * One notice for every role or location limit (Phase 5): what this role can
 * do here, and who can change it. It explains; it never authorises. Every
 * mutation is still checked on the server, so hiding or showing a control is
 * only a convenience. `forbidden` and `notMember` follow a refused request,
 * so they are announced; the others are page notes.
 */
export function RoleNotice({ kind, locale, role, name }: { kind: RoleNoticeKind; locale: PrototypeLocale; role?: WorkspaceRole; name?: string }) {
  const t = copy[locale].shell.access
  if (["viewer", "viewerAction", "viewerAssets", "createReadOnly"].includes(kind)) {
    return <div className="role-notice" role="note" data-kind={kind}><Lock aria-hidden="true" /><span>{t.viewerLine}</span></div>
  }
  const item = t[kind]
  const values = { role: role ? roleLabel(role, locale) : "", name: name ?? "" }
  const alert = kind === "forbidden" || kind === "notMember"
  // Owner-only pages already say who can change them; only a shop outside
  // your scope needs the pointer to Team.
  const hint = kind === "notMember" ? t.notMember.hint : kind === "outOfScope" ? t.askOwner : null
  return (
    <div className="role-notice" role={alert ? "alert" : "note"} data-kind={kind}>
      {alert ? <ShieldAlert aria-hidden="true" /> : <Lock aria-hidden="true" />}
      <div>
        <strong>{fill(item.title, values)}</strong>
        <span>{fill(item.body, values)}</span>
        {hint && <small>{hint}</small>}
      </div>
      {!alert && <Badge variant="outline">{OWNER_ONLY.has(kind) ? t.ownerOnly : t.readOnly}</Badge>}
    </div>
  )
}
