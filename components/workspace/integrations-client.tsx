"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { AtSign, LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PrototypeLocale } from "@/lib/copy"
import { confirmInstagramHandle } from "@/lib/workspace/client"

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

const COPY = {
  en: {
    label: "Public Instagram handle", note: "Public evidence only; confirming a handle never grants publishing access.",
    confirm: "Confirm handle", update: "Update handle", saved: "Instagram handle confirmed:",
    invalid: "That does not look like an Instagram handle.", forbidden: "Only the owner can change integrations.",
    network: "The server could not be reached; try again shortly.", failed: "The handle could not be saved.",
  },
  "zh-HK": {
    label: "公開 Instagram 帳號", note: "只讀取公開證據；確認帳號不會授予任何發佈權限。",
    confirm: "確認帳號", update: "更新帳號", saved: "已確認 Instagram 帳號：",
    invalid: "這看來不是有效的 Instagram 帳號。", forbidden: "只有店主可以更改連接設定。",
    network: "無法連接伺服器，請稍後再試。", failed: "未能儲存帳號。",
  },
  "zh-TW": {
    label: "公開 Instagram 帳號", note: "只讀取公開證據；確認帳號不會授予任何發布權限。",
    confirm: "確認帳號", update: "更新帳號", saved: "已確認 Instagram 帳號：",
    invalid: "這看起來不是有效的 Instagram 帳號。", forbidden: "只有店家負責人可以更改連接設定。",
    network: "無法連線至伺服器，請稍後再試。", failed: "無法儲存帳號。",
  },
} as const satisfies Record<PrototypeLocale, Record<string, string>>
