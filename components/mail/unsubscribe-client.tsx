"use client"

import Link from "next/link"
import { useState } from "react"

import { PublicPageFrame, SectionCard } from "@/components/product-ui"
import { Button } from "@/components/ui/button"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { t } from "@/lib/i18n"

type UnsubscribeState = "idle" | "submitting" | "done" | "invalid"

/**
 * The confirm button when the server-verified token is valid, or the neutral
 * invalid view otherwise (docs/superpowers/specs/2026-09-27-mail-outbox-
 * design.md §5). The page component (app/[locale]/unsubscribe/page.tsx)
 * verifies the token server-side only to pick which view to render and never
 * calls the repository itself -- this component is the only thing that ever
 * POSTs, and only once the person clicks the button.
 */
export function UnsubscribeClient({
  locale,
  token,
  valid,
}: {
  locale: PrototypeLocale
  token: string
  valid: boolean
}) {
  const [state, setState] = useState<UnsubscribeState>(valid ? "idle" : "invalid")

  async function submit() {
    setState("submitting")
    try {
      const response = await fetch("/api/mail/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      })
      setState(response.ok ? "done" : "invalid")
    } catch {
      setState("invalid")
    }
  }

  return (
    <PublicPageFrame locale={locale}>
      <main className="unsubscribe-page">
        <SectionCard className="unsubscribe-card">
          <h1>{t(locale, "mail.unsubscribeTitle")}</h1>
          {state === "done" ? (
            <p>{t(locale, "mail.unsubscribeDone")}</p>
          ) : state === "invalid" ? (
            <>
              <p>{t(locale, "mail.unsubscribeInvalid")}</p>
              {/* The message points at workspace settings; give the way there. */}
              <Button asChild variant="outline"><Link href={`/${locale}/owner/sign-in`}>{copy[locale].nav.signIn}</Link></Button>
            </>
          ) : (
            <Button onClick={() => void submit()} size="lg" disabled={state === "submitting"}>
              {t(locale, "mail.unsubscribeConfirm")}
            </Button>
          )}
        </SectionCard>
      </main>
    </PublicPageFrame>
  )
}
