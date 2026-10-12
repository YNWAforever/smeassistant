"use client"

import { useEffect, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PrototypeLocale } from "@/lib/copy"

const copy = {
  en: {
    heading: "Already unlocked this report? Email me a new link",
    label: "Email address",
    submit: "Email me a link",
    sent: "If that address is eligible to access this report, we will send a recovery link. It works once, for 60 minutes.",
  },
  "zh-HK": {
    heading: "已解鎖這份報告？以電郵傳送新連結",
    label: "電郵地址",
    submit: "寄送連結",
    sent: "如這個電郵地址符合報告存取條件，我們會寄出恢復連結。連結只可使用一次，60 分鐘內有效。",
  },
  "zh-TW": {
    heading: "已解鎖這份報告？用電子郵件寄送新連結",
    label: "電子郵件地址",
    submit: "寄送連結",
    sent: "如果這個電子郵件地址符合報告存取條件，我們會寄出恢復連結。連結只能使用一次，60 分鐘內有效。",
  },
} satisfies Record<PrototypeLocale, { heading: string; label: string; submit: string; sent: string }>

export function RecoveryForm({ locale, slug }: { locale: PrototypeLocale; slug: string }) {
  const c = copy[locale]
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error,setError]=useState(false)
  const [retryAt,setRetryAt]=useState(0)
  const [now,setNow]=useState(()=>Date.now())
  const seconds=Math.max(0,Math.ceil((retryAt-now)/1000))
  useEffect(()=>{if(!retryAt)return; const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[retryAt])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if(submitting || Date.now()<retryAt)return
    setSubmitting(true)
    setError(false)
    try {
      const response=await fetch("/api/report-access/recover", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ slug, email, locale }),
      })
      if(response.status===200)setSent(true)
      else {
        setError(true)
        if(response.status===429){
          const raw=response.headers?.get("retry-after")
          const numeric=raw?Number(raw):NaN
          const delay=Number.isFinite(numeric)&&numeric>=0?numeric*1000:raw?Date.parse(raw)-Date.now():60_000
          setNow(Date.now())
          setRetryAt(Date.now()+Math.min(3600_000,Math.max(1000,Number.isFinite(delay)?delay:60_000)))
        }
      }
    } catch {
      setError(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="recovery-form" onSubmit={(event) => void submit(event)}>
      <h3>{c.heading}</h3>
      {sent ? (
        <p role="status">{c.sent}</p>
      ) : (
        <>
          {error && <p role="alert">{locale==='en'?"The request could not be accepted. Please try again later.":locale==='zh-TW'?"目前無法受理請求，請稍後重試。":"目前未能受理請求，請稍後重試。"}{seconds>0?` (${seconds}s)`:''}</p>}
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
          <Button type="submit" variant="outline" disabled={submitting || seconds>0}>
            {c.submit}
          </Button>
        </>
      )}
    </form>
  )
}
