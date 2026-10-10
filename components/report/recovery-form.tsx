"use client"

import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PrototypeLocale } from "@/lib/copy"

const copy = {
  en: {
    heading: "Already unlocked this report? Email me a new link",
    label: "Email address",
    submit: "Email me a link",
    sent: "If that address unlocked this report, a link is on its way. It works once, for 60 minutes.",
  },
  "zh-HK": {
    heading: "已解鎖這份報告？以電郵傳送新連結",
    label: "電郵地址",
    submit: "寄送連結",
    sent: "如該地址曾解鎖此報告，連結已在途中。連結只可使用一次，60 分鐘內有效。",
  },
  "zh-TW": {
    heading: "已解鎖這份報告？用電子郵件寄送新連結",
    label: "電子郵件地址",
    submit: "寄送連結",
    sent: "如果該地址曾解鎖這份報告，連結已寄出。連結只能使用一次，60 分鐘內有效。",
  },
} satisfies Record<PrototypeLocale, { heading: string; label: string; submit: string; sent: string }>

export function RecoveryForm({ locale, slug }: { locale: PrototypeLocale; slug: string }) {
  const c = copy[locale]
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await fetch("/api/report-access/recover", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ slug, email, locale }),
      })
    } catch {
      // Deliberately swallowed: the visitor sees the same message either way, so
      // the form never reveals whether the address unlocked this report.
    } finally {
      setSubmitting(false)
      setSent(true)
    }
  }

  return (
    <form className="recovery-form" onSubmit={(event) => void submit(event)}>
      <h3>{c.heading}</h3>
      {sent ? (
        <p role="status">{c.sent}</p>
      ) : (
        <>
          <Label htmlFor={`recovery-email-${slug}`}>{c.label}</Label>
          <Input
            id={`recovery-email-${slug}`}
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={submitting}>
            {c.submit}
          </Button>
        </>
      )}
    </form>
  )
}
