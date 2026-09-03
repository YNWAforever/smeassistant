"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { LoaderCircle, MapPin, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import type { PrototypeLocale } from "@/lib/copy"
import { inviteMember, removeMember, updateMember, type ClientResult } from "@/lib/workspace/client"

/**
 * Owner-only team mutations (CLAUDE.md §3.9, Phase 6 item 5): the invite
 * sheet posts to the copied members route (which sends the magic link), the
 * remove button confirms through an AlertDialog, and a manager's location
 * scope is a multi-select of the workspace's locations saved through PATCH
 * members/[memberId]. The page renders these only for owners; the routes
 * enforce the same rule server-side.
 */
type InviteRole = "manager" | "viewer"

function failureMessage(result: Extract<ClientResult<unknown>, { ok: false }>, t: (typeof COPY)[PrototypeLocale]): string {
  if (result.error === "offline" || result.error === "network") return t.network
  if (result.status === 403) return t.forbidden
  if (result.status === 409) return t.duplicate
  if (result.status === 400) return t.invalid
  return t.failed
}

export function InviteMemberSheet({ locale, workspaceId }: { locale: PrototypeLocale; workspaceId: string }) {
  const router = useRouter()
  const t = COPY[locale]
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<InviteRole>("manager")
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast.error(t.invalid); return }
    setBusy(true)
    const result = await inviteMember(workspaceId, { email: email.trim(), role, locale })
    setBusy(false)
    if (!result.ok) { toast.error(failureMessage(result, t)); return }
    toast.success(t.invited)
    setOpen(false)
    setEmail("")
    router.refresh()
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild><Button><Plus /> {t.invite}</Button></SheetTrigger>
      <SheetContent>
        <form onSubmit={(event) => void submit(event)}>
          <SheetHeader><SheetTitle>{t.invite}</SheetTitle><SheetDescription>{t.inviteNote}</SheetDescription></SheetHeader>
          <div className="sheet-form">
            <div className="field-stack"><Label htmlFor="invite-email">{t.email}</Label><Input id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="off" /></div>
            <div className="field-stack"><Label htmlFor="invite-role">{t.role}</Label><Select value={role} onValueChange={(value) => setRole(value as InviteRole)}><SelectTrigger id="invite-role"><SelectValue>{role === "manager" ? t.manager : t.viewer}</SelectValue></SelectTrigger><SelectContent><SelectItem value="manager">{t.manager}</SelectItem><SelectItem value="viewer">{t.viewer}</SelectItem></SelectContent></Select></div>
          </div>
          <SheetFooter><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Plus />} {t.send}</Button></SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

export function RemoveMemberButton({ locale, workspaceId, memberId, email }: { locale: PrototypeLocale; workspaceId: string; memberId: string; email: string }) {
  const router = useRouter()
  const t = COPY[locale]
  const [busy, setBusy] = useState(false)

  async function remove() {
    setBusy(true)
    const result = await removeMember(workspaceId, memberId)
    setBusy(false)
    if (!result.ok) { toast.error(failureMessage(result, t)); return }
    toast.success(t.removed)
    router.refresh()
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant="ghost" size="sm" disabled={busy} aria-label={`${t.remove} ${email}`}><Trash2 /> {t.remove}</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{t.removeTitle}</AlertDialogTitle><AlertDialogDescription>{t.removeNote} {email}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>{t.cancel}</AlertDialogCancel><AlertDialogAction onClick={() => void remove()}>{t.remove}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Manager location scope: "all locations" or a checked subset; saved as `location_scope` (null = all). */
export function MemberScopeControl({ locale, workspaceId, memberId, locations, scope }: { locale: PrototypeLocale; workspaceId: string; memberId: string; locations: Array<{ id: string; name: string }>; scope: string[] | null }) {
  const router = useRouter()
  const t = COPY[locale]
  const [selected, setSelected] = useState<string[] | null>(scope)
  const [busy, setBusy] = useState(false)
  const dirty = JSON.stringify(selected === null ? null : [...selected].sort()) !== JSON.stringify(scope === null ? null : [...scope].sort())

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const list = current ?? locations.map((l) => l.id)
      const next = checked ? Array.from(new Set([...list, id])) : list.filter((item) => item !== id)
      return next
    })
  }

  async function save() {
    if (busy || !dirty) return
    if (selected !== null && selected.length === 0) { toast.error(t.scopeEmpty); return }
    setBusy(true)
    const result = await updateMember(workspaceId, memberId, { location_scope: selected })
    setBusy(false)
    if (!result.ok) { toast.error(failureMessage(result, t)); return }
    toast.success(t.scopeSaved)
    router.refresh()
  }

  return (
    <div className="field-stack member-scope">
      <Label><Checkbox checked={selected === null} onCheckedChange={(checked) => setSelected(checked ? null : locations.map((l) => l.id))} disabled={busy} /> <span><MapPin /> {t.allLocations}</span></Label>
      {locations.map((location) => (
        <Label key={location.id}><Checkbox checked={selected === null || selected.includes(location.id)} disabled={busy || selected === null} onCheckedChange={(checked) => toggle(location.id, checked === true)} /> <span>{location.name}</span></Label>
      ))}
      {dirty && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void save()}>{busy ? <LoaderCircle className="animate-spin" /> : null} {t.saveScope}</Button>}
    </div>
  )
}

/** Owner-only role switch for non-owner members (manager ⇄ viewer). */
export function MemberRoleSelect({ locale, workspaceId, memberId, role }: { locale: PrototypeLocale; workspaceId: string; memberId: string; role: InviteRole }) {
  const router = useRouter()
  const t = COPY[locale]
  const [busy, setBusy] = useState(false)

  async function change(next: string) {
    if (busy || (next !== "manager" && next !== "viewer") || next === role) return
    setBusy(true)
    const result = await updateMember(workspaceId, memberId, { role: next })
    setBusy(false)
    if (!result.ok) { toast.error(failureMessage(result, t)); return }
    toast.success(t.roleSaved)
    router.refresh()
  }

  return (
    <Select value={role} onValueChange={(value) => void change(value)} disabled={busy}>
      <SelectTrigger aria-label={t.role}><SelectValue>{role === "manager" ? t.manager : t.viewer}</SelectValue></SelectTrigger>
      <SelectContent><SelectItem value="manager">{t.manager}</SelectItem><SelectItem value="viewer">{t.viewer}</SelectItem></SelectContent>
    </Select>
  )
}

const COPY = {
  en: {
    invite: "Invite member", inviteNote: "We email a magic link; the member joins with the role you choose. Owners are never invited here.",
    email: "Email", role: "Role", manager: "Manager", viewer: "Viewer", send: "Send invite", invited: "Invite sent by email.",
    remove: "Remove", removeTitle: "Remove this member?", removeNote: "Their access ends immediately; audit history is kept.", removed: "Member removed.", cancel: "Cancel",
    allLocations: "All locations", saveScope: "Save scope", scopeSaved: "Location scope saved.", scopeEmpty: "Choose at least one location, or all locations.", roleSaved: "Role updated.",
    invalid: "Enter a valid email address.", duplicate: "This email is already a member or has a pending invite.", forbidden: "Only the owner can manage the team.",
    network: "The server could not be reached; try again shortly.", failed: "The request failed.",
  },
  "zh-HK": {
    invite: "邀請成員", inviteNote: "我們會寄出登入連結電郵；成員以你選擇的角色加入。店主角色不會在此邀請。",
    email: "電郵", role: "角色", manager: "經理", viewer: "檢視者", send: "寄出邀請", invited: "邀請電郵已寄出。",
    remove: "移除", removeTitle: "移除此成員？", removeNote: "其存取權會即時終止；審計紀錄會保留。", removed: "成員已移除。", cancel: "取消",
    allLocations: "所有地點", saveScope: "儲存範圍", scopeSaved: "地點範圍已儲存。", scopeEmpty: "請選擇至少一個地點，或所有地點。", roleSaved: "角色已更新。",
    invalid: "請輸入有效電郵。", duplicate: "此電郵已是成員或已有待接受的邀請。", forbidden: "只有店主可以管理團隊。",
    network: "無法連接伺服器，請稍後再試。", failed: "操作失敗。",
  },
  "zh-TW": {
    invite: "邀請成員", inviteNote: "我們會寄出登入連結電子郵件；成員以你選擇的角色加入。店家負責人角色不會在此邀請。",
    email: "電子郵件", role: "角色", manager: "經理", viewer: "檢視者", send: "送出邀請", invited: "邀請郵件已送出。",
    remove: "移除", removeTitle: "移除此成員？", removeNote: "其存取權會立即終止；稽核紀錄會保留。", removed: "成員已移除。", cancel: "取消",
    allLocations: "所有據點", saveScope: "儲存範圍", scopeSaved: "據點範圍已儲存。", scopeEmpty: "請選擇至少一個據點，或所有據點。", roleSaved: "角色已更新。",
    invalid: "請輸入有效的電子郵件。", duplicate: "此電子郵件已是成員或已有待接受的邀請。", forbidden: "只有店家負責人可以管理團隊。",
    network: "無法連線至伺服器，請稍後再試。", failed: "操作失敗。",
  },
} as const satisfies Record<PrototypeLocale, Record<string, string>>
