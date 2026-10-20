"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { copy, type PrototypeLocale } from "@/lib/copy"

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

export function AccessRequestForm({ slug, market, locale }: { slug: string; market: "hk" | "tw"; locale: PrototypeLocale }) {
  const t = copy[locale].accessRequest
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
      toast.error(t.toasts.missing)
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
      toast.success(t.toasts.recorded)
      router.refresh()
      return
    }
    if (response.status === 429) toast.error(t.toasts.tooMany)
    else if (response.status === 404) toast.error(t.toasts.notMatched)
    else toast.error(t.toasts.failed)
  }

  return (
    <form className="field-stack" onSubmit={(event) => void submit(event)}>
      <p>{t.form.notProof}</p>
      <Label htmlFor="request-intent">{t.form.intent}</Label>
      <Textarea id="request-intent" rows={3} value={intent} onChange={(event) => setIntent(event.target.value)} disabled={busy} />
      <Label htmlFor="request-channel">{t.form.channel}</Label>
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
      <Label htmlFor="request-contact">{t.form.contact}</Label>
      <Input id="request-contact" value={contact} onChange={(event) => setContact(event.target.value)} disabled={busy} />
      <Label htmlFor="request-evidence">{t.form.evidence}</Label>
      <Input
        id="request-evidence"
        value={evidence}
        onChange={(event) => setEvidence(event.target.value)}
        disabled={busy}
        placeholder={t.form.evidencePlaceholder}
      />
      <small>{t.form.evidenceNote}</small>
      <Button type="submit" disabled={busy}>{t.form.submit}</Button>
    </form>
  )
}
