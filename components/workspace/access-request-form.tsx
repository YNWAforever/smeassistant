"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

/**
 * Asks Fimmick to assign this report's workspace (Phase 2 item 27).
 *
 * Channels follow the market, matching the unlock funnel: WhatsApp in HK, LINE
 * in TW, phone and email in both. Filing is not ownership -- the copy says so,
 * because an operator still has to verify independently.
 */
const CHANNELS: Record<"hk" | "tw", Array<{ value: string; label: string }>> = {
  hk: [
    { value: "whatsapp", label: "WhatsApp" },
    { value: "phone", label: "Phone" },
    { value: "email", label: "Email" },
  ],
  tw: [
    { value: "line", label: "LINE" },
    { value: "phone", label: "Phone" },
    { value: "email", label: "Email" },
  ],
}

export function AccessRequestForm({ slug, market, isChinese }: { slug: string; market: "hk" | "tw"; isChinese: boolean }) {
  const router = useRouter()
  const [intent, setIntent] = useState("")
  const [channel, setChannel] = useState(CHANNELS[market][0].value)
  const [contact, setContact] = useState("")
  const [evidence, setEvidence] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!intent.trim() || !contact.trim()) {
      toast.error(isChinese ? "請填寫你的說明及聯絡方式。" : "Describe your request and how to reach you.")
      return
    }
    setBusy(true)
    const response = await fetch("/api/access-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug,
        intent: intent.trim(),
        preferred_contact_channel: channel,
        contact_identifier: contact.trim(),
        evidence_ref: evidence.trim() || undefined,
      }),
    })
    setBusy(false)
    if (response.ok) {
      toast.success(isChinese ? "已記錄你的申請。" : "Your request is recorded.")
      router.refresh()
      return
    }
    if (response.status === 429) toast.error(isChinese ? "請求過於頻繁，請稍後再試。" : "Too many requests; try again shortly.")
    else if (response.status === 404) toast.error(isChinese ? "此報告未能與你的帳戶對應。" : "This report could not be matched to your account.")
    else toast.error(isChinese ? "未能提交申請。" : "The request could not be submitted.")
  }

  return (
    <form className="field-stack" onSubmit={(event) => void submit(event)}>
      <p>
        {isChinese
          ? "提交申請不等於證明擁有權；Fimmick 會另行核實。"
          : "Filing a request is not proof of ownership; Fimmick verifies it separately."}
      </p>
      <Label htmlFor="request-intent">{isChinese ? "你想申請甚麼？" : "What are you asking for?"}</Label>
      <Textarea id="request-intent" rows={3} value={intent} onChange={(event) => setIntent(event.target.value)} disabled={busy} />
      <Label htmlFor="request-channel">{isChinese ? "聯絡方式" : "How should we reach you?"}</Label>
      <select
        id="request-channel"
        className="native-select"
        value={channel}
        onChange={(event) => setChannel(event.target.value)}
        disabled={busy}
      >
        {CHANNELS[market].map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <Label htmlFor="request-contact">{isChinese ? "聯絡號碼或地址" : "Number or address"}</Label>
      <Input id="request-contact" value={contact} onChange={(event) => setContact(event.target.value)} disabled={busy} />
      <Label htmlFor="request-evidence">{isChinese ? "可供核實的參考（選填）" : "Something we can check (optional)"}</Label>
      <Input
        id="request-evidence"
        value={evidence}
        onChange={(event) => setEvidence(event.target.value)}
        disabled={busy}
        placeholder={isChinese ? "例如商業登記號碼" : "For example a business registration number"}
      />
      <small>
        {isChinese
          ? "請填寫可獨立核實的參考，不需上載文件。"
          : "A reference we can check independently. Do not upload documents; there is no upload here."}
      </small>
      <Button type="submit" disabled={busy}>{isChinese ? "提交申請" : "Send the request"}</Button>
    </form>
  )
}
