"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { ArrowRight, CircleAlert, Eye, ListChecks, LockKeyhole, UserCheck } from "lucide-react"

import { PublicPageFrame } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { SCAN_OBJECTIVES, type ScanObjective } from "@/lib/funnel/scan-start"
import {
  buildUnlockPayload,
  defaultUnlockChannel,
  generateIdempotencyKey,
  unlockChannels,
  validateUnlockForm,
  type UnlockChannel,
  type UnlockFormValues,
  type UnlockMarket,
} from "@/lib/funnel/unlock"
import { t } from "@/lib/i18n"

const OBJECTIVE_MESSAGE_KEYS: Record<ScanObjective, string> = {
  more_leads: "scanner.objectiveMoreLeads",
  better_visibility: "scanner.objectiveBetterVisibility",
  improve_trust: "scanner.objectiveImproveTrust",
  understand_performance: "scanner.objectiveUnderstandPerformance",
}

const BENEFIT_ICONS = [Eye, UserCheck, ListChecks] as const

export function UnlockPage({ locale, slug, market }: { locale: PrototypeLocale; slug: string; market: UnlockMarket }) {
  const c = copy[locale].funnel.unlock
  const router = useRouter()
  const channels = unlockChannels(market)
  const [objective, setObjective] = useState<ScanObjective>("better_visibility")
  const [values, setValues] = useState<UnlockFormValues>({
    channel: defaultUnlockChannel(market),
    contact: "",
    recoveryEmail: "",
    reportDelivery: false,
    scanDiscussion: false,
    marketing: false,
  })
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  // One key per page load: a retry of the same form must stay idempotent per
  // (job, key). Generated on first submit so no random value is produced during
  // server rendering.
  const idempotencyKey = useRef("")

  function update(patch: Partial<UnlockFormValues>) {
    setValues((current) => ({ ...current, ...patch }))
    setError("")
  }

  async function submit() {
    const problems = validateUnlockForm(market, values)
    if (problems.length) {
      setError(problems[0] === "delivery_required" ? c.errors.delivery : problems[0] === "contact_invalid" ? c.errors.invalidContact : c.errors.contact)
      return
    }
    setSubmitting(true)
    setError("")
    if (!idempotencyKey.current) idempotencyKey.current = generateIdempotencyKey()
    try {
      const response = await fetch("/api/report-access/unlock", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(buildUnlockPayload({ slug, market, objective, locale, values, idempotencyKey: idempotencyKey.current })),
      })
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; reportUrl?: string; error?: string }
      if (response.status === 429) {
        setError(t(locale, "scanner.candidateErrorRateLimited"))
        return
      }
      if (!response.ok || !data.ok || !data.reportUrl) {
        setError(data.error ?? c.errors.failed)
        return
      }
      router.push(data.reportUrl)
    } catch {
      setError(c.errors.network)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PublicPageFrame locale={locale}>
      <main className="unlock-page">
        <section className="unlock-context">
          <Badge variant="outline">
            {c.reportLabel} · {slug}
          </Badge>
          <h1>{c.title}</h1>
          <p>{c.body}</p>
          <div className="unlock-benefits">
            {c.benefits.map((benefit, index) => {
              const Icon = BENEFIT_ICONS[index] ?? Eye
              return (
                <div key={benefit.title}>
                  <Icon />
                  <span>
                    <strong>{benefit.title}</strong>
                    <small>{benefit.body}</small>
                  </span>
                </div>
              )
            })}
          </div>
        </section>
        <section className="unlock-form-card">
          <h2>{c.formTitle}</h2>
          <p>{c.formBody}</p>
          {error && (
            <div className="form-error" role="alert">
              <CircleAlert />
              {error}
            </div>
          )}

          <div className="field-stack">
            <Label htmlFor="unlock-objective">{c.objectiveHeading}</Label>
            <Select value={objective} onValueChange={(value) => setObjective(value as ScanObjective)}>
              <SelectTrigger id="unlock-objective" className="w-full">
                <SelectValue>{t(locale, OBJECTIVE_MESSAGE_KEYS[objective])}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SCAN_OBJECTIVES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {t(locale, OBJECTIVE_MESSAGE_KEYS[item])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="field-stack">
            <Label>{c.channelHeading}</Label>
            <RadioGroup value={values.channel} onValueChange={(value) => update({ channel: value as UnlockChannel, contact: "" })}>
              {channels.map((channel) => (
                <Label className="consent-row" key={channel} htmlFor={`unlock-channel-${channel}`}>
                  <RadioGroupItem id={`unlock-channel-${channel}`} value={channel} />
                  <span>
                    <strong>{c.channels[channel]}</strong>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div className="field-stack">
            <Label htmlFor="unlock-contact">{c.contactLabels[values.channel]}</Label>
            <Input
              id="unlock-contact"
              value={values.contact}
              placeholder={c.placeholders[values.channel]}
              onChange={(event) => update({ contact: event.target.value })}
            />
          </div>

          {values.channel !== "email" && (
            <div className="field-stack">
              <Label htmlFor="unlock-recovery">{c.recoveryLabel}</Label>
              <Input
                id="unlock-recovery"
                type="email"
                value={values.recoveryEmail}
                placeholder={c.placeholders.email}
                onChange={(event) => update({ recoveryEmail: event.target.value })}
              />
              <small>{c.recoveryHint}</small>
            </div>
          )}

          <Label className="consent-row" htmlFor="delivery-consent">
            <Checkbox id="delivery-consent" checked={values.reportDelivery} onCheckedChange={(value) => update({ reportDelivery: Boolean(value) })} />
            <span>
              <strong>{c.deliveryTitle}</strong>
              <small>{c.formBody}</small>
            </span>
          </Label>
          <Label className="consent-row" htmlFor="discussion-consent">
            <Checkbox id="discussion-consent" checked={values.scanDiscussion} onCheckedChange={(value) => update({ scanDiscussion: Boolean(value) })} />
            <span>
              <strong>{c.discussionTitle}</strong>
              <small>{c.discussionBody}</small>
            </span>
          </Label>
          <Label className="consent-row" htmlFor="marketing-consent">
            <Checkbox id="marketing-consent" checked={values.marketing} onCheckedChange={(value) => update({ marketing: Boolean(value) })} />
            <span>
              <strong>{c.marketingTitle}</strong>
              <small>{c.marketingBody}</small>
            </span>
          </Label>

          <Button onClick={() => void submit()} size="lg" className="w-full" disabled={submitting}>
            {submitting ? c.submitting : c.submit} <ArrowRight />
          </Button>
          <p className="privacy-note">
            <LockKeyhole /> {c.privacyNote}
          </p>
          <Link href={`/${locale}/trust`}>{c.policyLink}</Link>
        </section>
      </main>
    </PublicPageFrame>
  )
}
