"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { AtSign, LoaderCircle, Unplug } from "lucide-react"
import { toast } from "sonner"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PrototypeLocale } from "@/lib/copy"
import { confirmInstagramHandle, disconnectGoogleConnection } from "@/lib/workspace/client"

/**
 * Inline Instagram handle confirmation on the integrations page (Phase 6
 * item 3). Not an OAuth connection: the owner eyeballs the public handle and
 * the copied route stores it on the workspace and primary location. Owner
 * only, enforced by the route; the page renders this only for owners.
 */
export function InstagramHandleForm({ locale, workspaceId, handle }: { locale: PrototypeLocale; workspaceId: string; handle: string | null }) {
  const router = useRouter()
  const t = COPY[locale]
  const [value, setValue] = useState(handle ?? "")
  const [busy, setBusy] = useState(false)
  const unchanged = value.trim().replace(/^@/, "").toLowerCase() === (handle ?? "").toLowerCase()

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !value.trim()) return
    setBusy(true)
    const result = await confirmInstagramHandle(workspaceId, value.trim(), locale)
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error === "offline" || result.error === "network" ? t.network : result.status === 400 ? t.invalid : result.status === 403 ? t.forbidden : t.failed)
      return
    }
    setValue(result.data.handle)
    toast.success(`${t.saved} @${result.data.handle}`)
    router.refresh()
  }

  return (
    <form className="integration-actions instagram-handle-form" onSubmit={(event) => void submit(event)}>
      <div className="field-stack">
        <Label htmlFor="instagram-handle">{t.label}</Label>
        <Input id="instagram-handle" value={value} onChange={(event) => setValue(event.target.value)} placeholder="@yourshop" autoComplete="off" spellCheck={false} maxLength={64} />
        <small className="limitation-note">{t.note}</small>
      </div>
      <Button type="submit" variant="outline" disabled={busy || !value.trim() || unchanged}>{busy ? <LoaderCircle className="animate-spin" /> : <AtSign />} {handle ? t.update : t.confirm}</Button>
    </form>
  )
}

/**
 * Withdraws the Google Business Profile connection -- the control onboarding
 * has always promised ("you can disconnect at any time in settings") and that
 * did not exist until now. Owner only, enforced by the route and by the page,
 * which loads at `minRole: "owner"`.
 *
 * The dialog states exactly what disconnecting does and does not do. It deletes
 * the credential this app stores; it cannot remove SME Scanner from the owner's
 * Google Account, so it links Google's own permissions page rather than leaving
 * the owner believing more happened than did.
 */
export function GoogleDisconnectButton({ locale, workspaceId }: { locale: PrototypeLocale; workspaceId: string }) {
  const router = useRouter()
  const t = COPY[locale]
  const [busy, setBusy] = useState(false)

  async function disconnect() {
    if (busy) return
    setBusy(true)
    const result = await disconnectGoogleConnection(workspaceId, locale)
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error === "offline" || result.error === "network" ? t.network : result.status === 403 ? t.forbidden : t.disconnectFailed)
      return
    }
    // `disconnected: false` means someone else got there first. The end state
    // the owner asked for still holds, so this is not an error.
    toast.success(result.data.disconnected ? t.disconnected : t.alreadyDisconnected)
    router.refresh()
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant="outline" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Unplug />} {t.disconnect}</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.disconnectTitle}</AlertDialogTitle>
          <AlertDialogDescription>{t.disconnectNote}</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="limitation-note">{t.googleAccountNote} <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">{t.googleAccountLink}</a></p>
        <AlertDialogFooter><AlertDialogCancel>{t.cancel}</AlertDialogCancel><AlertDialogAction onClick={() => void disconnect()}>{t.disconnect}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const COPY = {
  en: {
    label: "Public Instagram handle", note: "Public evidence only; confirming a handle never grants publishing access.",
    disconnect: "Disconnect", cancel: "Cancel",
    disconnectTitle: "Disconnect Google Business Profile?",
    disconnectNote: "The stored credential is deleted and this workspace stops reading Google evidence. Your workspace, past scans and reports are unaffected, and you can reconnect at any time.",
    googleAccountNote: "This removes the credential we hold. To remove SME Scanner's access from your Google Account as well:",
    googleAccountLink: "Google Account permissions",
    disconnected: "Google Business Profile disconnected.",
    alreadyDisconnected: "That connection was already disconnected.",
    disconnectFailed: "The connection could not be disconnected.",
    confirm: "Confirm handle", update: "Update handle", saved: "Instagram handle confirmed:",
    invalid: "That does not look like an Instagram handle.", forbidden: "Only the owner can change integrations.",
    network: "The server could not be reached; try again shortly.", failed: "The handle could not be saved.",
  },
  "zh-HK": {
    label: "公開 Instagram 帳號", note: "只讀取公開證據；確認帳號不會授予任何發佈權限。",
    disconnect: "解除連接", cancel: "取消",
    disconnectTitle: "解除 Google 商戶檔案連接？",
    disconnectNote: "已儲存的憑證會被刪除，這個工作台亦會停止讀取 Google 證據。工作台、過往掃描及報告不受影響，你可以隨時重新連接。",
    googleAccountNote: "這只會刪除我們持有的憑證。如要同時在你的 Google 帳戶移除 SME Scanner 的存取權：",
    googleAccountLink: "Google 帳戶權限設定",
    disconnected: "已解除 Google 商戶檔案連接。",
    alreadyDisconnected: "該連接已經解除。",
    disconnectFailed: "未能解除連接。",
    confirm: "確認帳號", update: "更新帳號", saved: "已確認 Instagram 帳號：",
    invalid: "這看來不是有效的 Instagram 帳號。", forbidden: "只有店主可以更改連接設定。",
    network: "無法連接伺服器，請稍後再試。", failed: "未能儲存帳號。",
  },
  "zh-TW": {
    label: "公開 Instagram 帳號", note: "只讀取公開證據；確認帳號不會授予任何發布權限。",
    disconnect: "解除連接", cancel: "取消",
    disconnectTitle: "解除 Google 商家檔案連接？",
    disconnectNote: "已儲存的憑證會被刪除，這個工作台也會停止讀取 Google 證據。工作台、過往掃描與報告不受影響，你可以隨時重新連接。",
    googleAccountNote: "這只會刪除我們保存的憑證。若要同時在你的 Google 帳戶移除 SME Scanner 的存取權：",
    googleAccountLink: "Google 帳戶權限設定",
    disconnected: "已解除 Google 商家檔案連接。",
    alreadyDisconnected: "該連接已經解除。",
    disconnectFailed: "無法解除連接。",
    confirm: "確認帳號", update: "更新帳號", saved: "已確認 Instagram 帳號：",
    invalid: "這看起來不是有效的 Instagram 帳號。", forbidden: "只有店家負責人可以更改連接設定。",
    network: "無法連線至伺服器，請稍後再試。", failed: "無法儲存帳號。",
  },
} as const satisfies Record<PrototypeLocale, Record<string, string>>
