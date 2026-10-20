"use client"

import { ArrowRight, Link2, Printer } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { copy, type PrototypeLocale } from "@/lib/copy"

/**
 * Save, share and print for an unlocked report. "Save to my workspace" only
 * starts the sign-in step, where ownership is verified (guardrail 15), so the
 * caller passes `claimHref` for an unlocked viewer only. The copied link is the
 * public share URL: anyone it is sent to sees the free preview.
 *
 * Printing opens every collapsed section first and closes them again after,
 * so the PDF holds the whole report.
 */
export function ReportActions({ locale, claimHref }: { locale: PrototypeLocale; claimHref?: string }) {
  const t = copy[locale].report.actions
  useEffect(() => {
    let opened: HTMLDetailsElement[] = []
    const before = () => {
      opened = Array.from(document.querySelectorAll<HTMLDetailsElement>(".report-page details:not([open])"))
      opened.forEach((detail) => { detail.open = true })
    }
    const after = () => {
      opened.forEach((detail) => { detail.open = false })
      opened = []
    }
    window.addEventListener("beforeprint", before)
    window.addEventListener("afterprint", after)
    return () => {
      window.removeEventListener("beforeprint", before)
      window.removeEventListener("afterprint", after)
    }
  }, [])
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}`)
      toast.success(t.copied)
    } catch {
      toast.error(t.copyFailed)
    }
  }
  return (
    <div className="report-actions" role="group" aria-label={t.label}>
      <div className="report-actions-buttons">
        {claimHref && (
          <Button asChild className="min-h-11">
            <Link href={claimHref}>{t.save}<ArrowRight aria-hidden="true" /></Link>
          </Button>
        )}
        <Button type="button" variant="outline" className="min-h-11" onClick={copyLink}>
          <Link2 aria-hidden="true" />{t.copyLink}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => window.print()}>
          <Printer aria-hidden="true" />{t.print}
        </Button>
      </div>
      <p className="report-actions-hint">{t.shareHint}</p>
    </div>
  )
}
