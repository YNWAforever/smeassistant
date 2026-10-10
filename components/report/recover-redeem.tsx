"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { PrototypeLocale } from "@/lib/copy"

const copy = {
  en: { open: "Open my report", expired: "This link has expired or was already used." },
  "zh-HK": { open: "開啟我的報告", expired: "此連結已過期或已使用。" },
  "zh-TW": { open: "開啟我的報告", expired: "這個連結已過期或已使用。" },
} satisfies Record<PrototypeLocale, { open: string; expired: string }>

/**
 * Nothing is requested on mount: mail scanners prefetch GET links, and the
 * redeem is one-use, so only a deliberate click may spend the token.
 */
export function RecoverRedeem({ locale }: { locale: PrototypeLocale }) {
  const c = copy[locale]
  const router = useRouter()
  const token = useSearchParams().get("t")
  const [busy, setBusy] = useState(false)
  const [expired, setExpired] = useState(!token)

  async function open() {
    setBusy(true)
    try {
      const response = await fetch("/api/report-access/redeem", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ token, locale }),
      })
      const data = (await response.json().catch(() => ({}))) as { reportUrl?: string }
      if (response.status === 200 && data.reportUrl) {
        router.replace(data.reportUrl)
        return
      }
    } catch {
      // Falls through to the single expired message; no further detail is revealed.
    }
    setExpired(true)
    setBusy(false)
  }

  if (expired) return <p role="alert">{c.expired}</p>
  return (
    <Button size="lg" onClick={() => void open()} disabled={busy}>
      {c.open}
    </Button>
  )
}
