"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowRight, CircleAlert, Copy } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { interpolate } from "@/lib/share"

/**
 * The unsaved preview form (P4.5, spec §3.2). One review in, at most one
 * draft out; nothing here saves, versions, approves or exports. After a draft
 * the form is replaced by the result, so there is no way to regenerate from
 * this page. Refusals render fixed copy per reason and never echo the input.
 */

type Refusal = keyof (typeof copy)["en"]["funnel"]["preview"]["refusals"]

const REFUSALS: ReadonlySet<string> = new Set<Refusal>([
  "already_used",
  "job_limit",
  "ip_limit",
  "daily_limit",
  "budget",
  "paused",
  "unavailable",
  "invalid_input",
])

const MAX_REVIEW = 1500
const RATINGS = [1, 2, 3, 4, 5] as const

type Outcome = { state: "generated"; body: string; warnings: string[] } | { state: "refused"; reason: Refusal }

/** Counts like lib/preview/input.ts: trimmed, in Unicode code points. */
function codePoints(value: string): number {
  return [...value.trim()].length
}

/** Anything the route did not promise (404, 5xx, a malformed body) is `unavailable`. */
async function readOutcome(response: Response): Promise<Outcome> {
  const unavailable: Outcome = { state: "refused", reason: "unavailable" }
  if (response.status !== 200 && response.status !== 400) return unavailable
  let data: unknown
  try {
    data = await response.json()
  } catch {
    return unavailable
  }
  if (!data || typeof data !== "object") return unavailable
  const { state, reason, body, warnings } = data as Record<string, unknown>
  if (state === "refused" && typeof reason === "string" && REFUSALS.has(reason)) return { state, reason: reason as Refusal }
  if (state === "generated" && response.status === 200 && typeof body === "string") {
    const list = Array.isArray(warnings) ? warnings.filter((item): item is string => typeof item === "string") : []
    return { state, body, warnings: list }
  }
  return unavailable
}

export function PreviewDraftForm({ locale, slug, claimHref }: { locale: PrototypeLocale; slug: string; claimHref: string }) {
  const p = copy[locale].funnel.preview
  const [review, setReview] = useState("")
  const [rating, setRating] = useState("none")
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const count = codePoints(review)

  async function submit() {
    if (pending) return
    setPending(true)
    setOutcome(null)
    const chosen = Number(rating)
    try {
      const response = await fetch(`/api/start/${encodeURIComponent(slug)}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ review, ...(Number.isInteger(chosen) && chosen >= 1 ? { rating: chosen } : {}), locale }),
      })
      setOutcome(await readOutcome(response))
    } catch {
      setOutcome({ state: "refused", reason: "unavailable" })
    } finally {
      setPending(false)
    }
  }

  async function copyDraft(body: string) {
    try {
      await navigator.clipboard.writeText(body)
      setCopyState("copied")
    } catch {
      setCopyState("failed")
    }
  }

  if (outcome?.state === "generated") {
    return (
      <section className="unlock-form-card" data-testid="preview-result">
        <Badge variant="outline">{p.badge}</Badge>
        <p style={{ whiteSpace: "pre-wrap" }}>
          {outcome.body}
        </p>
        {outcome.warnings.length > 0 && (
          <div className="limitations-box">
            <CircleAlert aria-hidden="true" />
            <div>
              <strong>{p.warningsLabel}</strong>
              <ul>
                {outcome.warnings.map((warning, index) => (
                  <li key={`${index}-${warning}`}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <Button type="button" variant="outline" onClick={() => void copyDraft(outcome.body)}>
          <Copy aria-hidden="true" />
          {p.copy}
        </Button>
        <p role="status">{copyState === "copied" ? p.copied : copyState === "failed" ? p.copyFailed : ""}</p>
        <p className="privacy-note">{p.notKept}</p>
        <Link href={claimHref}>
          {p.cta} <ArrowRight aria-hidden="true" />
        </Link>
      </section>
    )
  }

  return (
    <section className="unlock-form-card">
      {outcome?.state === "refused" && (
        <div className="form-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{p.refusals[outcome.reason]}</span>
          {outcome.reason === "already_used" && (
            <Link href={claimHref}>
              {p.cta} <ArrowRight aria-hidden="true" />
            </Link>
          )}
        </div>
      )}

      <div className="field-stack">
        <Label htmlFor="preview-review">{p.reviewLabel}</Label>
        <Textarea
          id="preview-review"
          rows={6}
          value={review}
          aria-describedby="preview-review-count"
          onChange={(event) => setReview(event.target.value)}
        />
        <small id="preview-review-count" data-testid="preview-count" data-over={count > MAX_REVIEW ? "true" : "false"}>
          {interpolate(p.count, { count })}
        </small>
      </div>

      <div className="field-stack">
        <Label id="preview-rating-label">{p.ratingLabel}</Label>
        <RadioGroup value={rating} onValueChange={setRating} aria-labelledby="preview-rating-label">
          <Label className="consent-row" htmlFor="preview-rating-none">
            <RadioGroupItem id="preview-rating-none" value="none" />
            <span>{p.noRating}</span>
          </Label>
          {RATINGS.map((value) => (
            <Label className="consent-row" key={value} htmlFor={`preview-rating-${value}`}>
              <RadioGroupItem id={`preview-rating-${value}`} value={String(value)} />
              <span>{interpolate(p.ratingOption, { rating: value })}</span>
            </Label>
          ))}
        </RadioGroup>
      </div>

      <Button type="button" size="lg" className="w-full" disabled={pending} onClick={() => void submit()}>
        {pending ? p.submitting : p.submit} <ArrowRight aria-hidden="true" />
      </Button>
    </section>
  )
}
