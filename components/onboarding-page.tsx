"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { ArrowRight, BadgeCheck, Check, CircleAlert, Globe2, ScanSearch, ShieldCheck, TriangleAlert, UserCheck } from "lucide-react"

import { AuthFrame } from "@/components/auth/auth-frame"
import { ErrorState } from "@/components/kinnso/states"
import { CapabilityBadge } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { InlineExplainer } from "@/components/visual/inline-explainer"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"

/** What the server page read from `audit_jobs` for the `claim` slug — public evidence only. */
export type ClaimEvidence = {
  shareSlug: string
  businessName: string | null
  district: string | null
  address?: string | null
  region: string | null
  workspaceId: string | null
  placeId: string | null
  igHandle: string | null
  websiteUrl: string | null
}

/**
 * What the workspace already holds. Present only once the caller owns it, so
 * the basics form shows the values that were saved rather than re-proposing the scan's
 * guesses over them.
 */
export type SavedSetup = {
  workspaceName: string | null
  locationName: string | null
  locationAddress: string | null
  voice: string | null
  /** Newline-joined for the textarea, the same shape the form submits. */
  approvedClaims: string
  /** A primary location exists, i.e. `POST /api/workspaces/claim` completed. */
  hasLocation: boolean
  /** Profile existence is independent of whether its voice has been set. */
  brandProfileExists: boolean
  workspaceSlug: string | null
}

export type OnboardingProps = {
  locale: PrototypeLocale
  claim?: string
  plan?: string
  /**
   * Derived from persisted ownership. Legacy steps 3–4 resume at basics too;
   * they never let an unverified caller skip the ownership screen.
   */
  resumeStep?: 1 | 2 | 3 | 4
  saved?: SavedSetup | null
  savedUnavailable?: boolean
  /** Verified actor scope supplied by the server; used only to isolate editor state. */
  scopeKey?: string
  /** `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED === "true"` on the server. */
  oauthEnabled: boolean
  /**
   * The caller's own ownership-request status, or the form to file one (P2.4
   * items 22 and 27). A node, so this component stays unaware of how status is
   * derived; optional, so every existing call site is unaffected.
   */
  accessRequest?: React.ReactNode
  /**
   * Market contact channels from `getMarketCtas`, resolved on the server.
   *
   * That helper reads `process.env[name]` through a computed key, which Next
   * cannot inline into a client bundle -- calling it from this component would
   * return an empty list on every deployment, however the vars are set. Empty
   * also when nothing is configured, and then no channel is offered at all
   * rather than a dead link.
   */
  contacts?: ReadonlyArray<{ channel: "whatsapp" | "line" | "phone" | "email"; href: string }>
  evidence: ClaimEvidence | null
  /** The caller holds an accepted owner membership on the job's workspace. */
  ownsWorkspace: boolean
  /** An active google_gbp oauth_connections row exists for that workspace. */
  gbpConnected: boolean
  /**
   * The claim, ownership or connection lookup failed. The page then shows an
   * error with a retry instead of quietly falling back to "start from a scan"
   * or "verify with Google", which would misstate where the owner stands.
   */
  lookupFailed?: boolean
}

// Must stay a subset of lib/workspace/brand.ts's BRAND_VOICES -- the server
// validates against that set, so a value only this file knows about is dropped.
type BrandVoice = "warm" | "professional" | "playful" | "direct"

const BRAND_VOICE_VALUES: readonly BrandVoice[] = ["warm", "professional", "playful", "direct"]

/** A stored voice this build does not know about must not become a dead Select value. */
function isBrandVoice(value: string | null | undefined): value is BrandVoice {
  return typeof value === "string" && (BRAND_VOICE_VALUES as readonly string[]).includes(value)
}

/** Signed in (always done here), verify ownership, business basics. */
const STEP_COUNT = 3

function marketOf(region: string | null) {
  const market = region?.toLowerCase() === "tw" ? "tw" : "hk"
  return { market, timezone: market === "tw" ? "Asia/Taipei" : "Asia/Hong_Kong" } as const
}

/**
 * Carry the report reference into the channel where the channel supports it,
 * so staff can find the scan without the owner retyping the slug. Phone and
 * LINE take no prefill, and the reference is printed beside the buttons for
 * every channel regardless. The prefill is for Fimmick staff, so it stays
 * in English whatever the interface language.
 */
function contactHref(contact: { channel: "whatsapp" | "line" | "phone" | "email"; href: string }, shareSlug: string | undefined): string {
  if (!shareSlug) return contact.href
  if (contact.channel === "whatsapp") return `${contact.href}?text=${encodeURIComponent(`Workspace assignment request - report ${shareSlug}`)}`
  if (contact.channel === "email") return `${contact.href}?subject=${encodeURIComponent(`Workspace assignment request - report ${shareSlug}`)}`
  return contact.href
}

/**
 * The first-run wizard: signed in, verify ownership, business basics.
 * Ownership comes from Google or a Fimmick assignment, never from this form;
 * claim completion still goes through the owner-only endpoint, and optional
 * settings never replace ownership proof.
 */
export function OnboardingPage(props: OnboardingProps) {
  // A failed read must not seed the recovered editor from scan guesses.
  // Ordinary same-scope refreshes still preserve an in-progress draft.
  return <OnboardingForm key={[props.scopeKey, props.claim, props.evidence?.workspaceId, props.ownsWorkspace, props.savedUnavailable === true].join(":")} {...props} />
}

function OnboardingForm({ locale, claim, plan, resumeStep, saved = null, savedUnavailable = false, oauthEnabled, contacts = [], evidence, ownsWorkspace, gbpConnected, accessRequest, lookupFailed = false }: OnboardingProps) {
  const router = useRouter()
  const t = copy[locale].onboarding
  const { market, timezone } = marketOf(evidence?.region ?? null)
  const marketName = t.markets[market]
  // 1 = verify ownership, 2 = business basics. A verified owner starts at basics.
  const [step, setStep] = useState(ownsWorkspace && evidence && resumeStep !== 1 ? 2 : 1)
  const stepTitle = useRef<HTMLHeadingElement>(null)
  const previousStep = useRef(step)
  useEffect(() => {
    if (previousStep.current !== step) stepTitle.current?.focus()
    previousStep.current = step
  }, [step])
  // Saved values win over the scan's guesses.
  const [workspaceName, setWorkspaceName] = useState(saved?.workspaceName ?? evidence?.businessName ?? "")
  // A NEW location has no name of its own yet, so it follows the visible
  // business name instead of being seeded from the scan: when the assigned
  // workspace name differs from the scan's name, a correction to the business
  // name must not leave the location pointing at the old scan name. An
  // existing location keeps its own name, and an explicit override wins.
  const [locationName, setLocationName] = useState(saved?.locationName ?? "")
  const [locationOverride, setLocationOverride] = useState(Boolean(saved?.hasLocation && saved?.locationName))
  const [locationAddress, setLocationAddress] = useState(saved?.locationAddress ?? evidence?.address ?? "")
  const [voice, setVoice] = useState<BrandVoice>(isBrandVoice(saved?.voice) ? saved.voice : "warm")
  const [approvedClaims, setApprovedClaims] = useState(saved?.approvedClaims ?? "")
  const [submitState, setSubmitState] = useState<{ kind: "idle" | "saving" | "error"; message?: string }>({ kind: "idle" })
  const pending = useRef<AbortController | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => () => { pending.current?.abort(); pending.current = null }, [])
  useEffect(() => {
    if (savedUnavailable || submitState.kind === "error") errorRef.current?.focus()
  }, [savedUnavailable, submitState.kind])

  const stepNames = [t.steps.verify, t.steps.basics]
  const ownershipLabel = ownsWorkspace ? (gbpConnected ? t.ownership.verified : t.ownership.assigned) : t.ownership.pending
  const voiceLabels = t.basics.voices
  // Optional override: blank means "use the business name", so clearing a
  // field inside the collapsed disclosure can never silently block completion.
  const effectiveLocationName = locationOverride && locationName.trim() ? locationName.trim() : workspaceName.trim()
  const existingBrand = ownsWorkspace && saved?.brandProfileExists === true
  const brandHref = saved?.workspaceSlug && /^[a-z0-9_-]+$/i.test(saved.workspaceSlug)
    ? `/${locale}/owner/${encodeURIComponent(saved.workspaceSlug)}/business/profile` : null
  const reloadHref = `/${locale}/owner/onboarding${claim ? `?claim=${encodeURIComponent(claim)}` : ""}`
  const canContinue = !savedUnavailable && !lookupFailed && Boolean(evidence) && ownsWorkspace && (step === 1 || workspaceName.trim().length > 0)
  const ref = evidence?.shareSlug ?? claim ?? ""

  async function completeWorkspace() {
    if (!evidence || !ownsWorkspace || !canContinue || step !== 2 || pending.current) return
    const controller = new AbortController()
    pending.current = controller
    let completed = false
    setSubmitState({ kind: "saving" })
    try {
      const response = await fetch("/api/workspaces/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          claim_slug: evidence.shareSlug,
          workspace_name: workspaceName.trim(),
          primary_location: { name: effectiveLocationName, address: locationAddress.trim() || null },
          market,
          timezone,
          locale,
          ...(!existingBrand ? {
            brand_voice: voice,
            approved_claims: approvedClaims.split("\n").map((line) => line.trim()).filter(Boolean),
          } : {}),
        }),
      })
      const data = (await response.json().catch(() => null)) as { workspaceSlug?: unknown; matchedActionId?: unknown; error?: unknown } | null
      if (controller.signal.aborted) return
      if (!response.ok) {
        setSubmitState({ kind: "error", message: response.status === 403 ? t.errors.forbidden : t.errors.failed })
        return
      }
      const slug = typeof data?.workspaceSlug === "string" ? data.workspaceSlug.trim() : ""
      if (!slug || !/^[a-z0-9_-]+$/i.test(slug)) {
        setSubmitState({ kind: "error", message: t.errors.resultUnavailable })
        return
      }
      // The server completes snapshot/action derivation before returning.
      // Preserve the visitor's chosen outcome when a compatible action exists.
      const actionId = typeof data?.matchedActionId === "string" ? data.matchedActionId : null
      const destination = actionId
        ? `/${locale}/owner/${slug}/actions/${encodeURIComponent(actionId)}`
        : `/${locale}/owner/${slug}`
      router.push(destination)
      completed = true
    } catch {
      if (!controller.signal.aborted) setSubmitState({ kind: "error", message: t.errors.network })
    } finally {
      if (!completed && pending.current === controller) pending.current = null
    }
  }

  const claimEvidence = evidence ? (
    <div className="onboarding-choice">
      <span className="onboarding-icon"><BadgeCheck /></span>
      <div>
        <Badge variant="outline">{t.evidence.badge}</Badge>
        <h3>{fill(t.evidence.title, { name: evidence.businessName ?? t.evidence.fallbackName })}</h3>
        <p>{[evidence.district, marketName].filter(Boolean).join(" · ")}</p>
        <dl>
          <div><dt>{t.evidence.ownership}</dt><dd>{ownershipLabel}</dd></div>
          <div><dt>{t.evidence.report}</dt><dd><Link href={`/${locale}/r/${evidence.shareSlug}`}>{t.evidence.viewReport}</Link></dd></div>
          {evidence.igHandle && <div><dt>Instagram</dt><dd>@{evidence.igHandle}</dd></div>}
          {evidence.websiteUrl && <div><dt>{t.evidence.website}</dt><dd>{evidence.websiteUrl}</dd></div>}
        </dl>
        {/* The escape the pre-claim /scan flow has. Before anything is attached
            it is a plain link -- no mutation. Once the report IS attached,
            detaching is not self-service: ownership is proven, never
            self-declared, and undoing it the same way would be a hijack primitive. */}
        <details className="onboarding-not-mine">
          <summary>{t.evidence.notMine}</summary>
          {ownsWorkspace
            ? <p>{fill(t.evidence.notMineOwned, { ref: evidence.shareSlug })}</p>
            : <p><Link href={`/${locale}/scan`}>{t.evidence.notMineScan}<ArrowRight aria-hidden="true" /></Link></p>}
        </details>
      </div>
    </div>
  ) : (
    <div className="onboarding-choice">
      <span className="onboarding-icon"><ScanSearch /></span>
      <div>
        <Badge variant="outline">{t.noClaim.badge}</Badge>
        <h3>{t.noClaim.title}</h3>
        <p>{t.noClaim.body}</p>
        <Button asChild><Link href={`/${locale}/scan`}><ScanSearch />{t.noClaim.action}<ArrowRight /></Link></Button>
      </div>
    </div>
  )
  const ownership = ownsWorkspace ? (
    <div className="onboarding-choice onboarding-verified">
      <span className="onboarding-icon"><ShieldCheck /></span>
      <div><Badge variant="outline">{ownershipLabel}</Badge><h3>{t.verified.title}</h3><p>{t.verified.body}</p></div>
    </div>
  ) : oauthEnabled && claim ? (
    <div className="connection-choice">
      <div>
        <span><Globe2 /></span>
        <div>
          <div className="onboarding-title-row"><h3>{t.google.title}</h3><InlineExplainer label={t.google.why} answer={t.google.whyAnswer} locale={locale} /></div>
          <p>{t.google.body}</p>
        </div>
        <CapabilityBadge value="Live" />
      </div>
      <Button asChild><a href={`/api/oauth/google/claim/start?slug=${encodeURIComponent(claim)}&locale=${locale}`}><ShieldCheck />{t.google.action}<ArrowRight /></a></Button>
      <p className="limitation-note"><TriangleAlert /> {t.google.readOnly}</p>
    </div>
  ) : (
    /* The shipped default (WORKSPACE_CLAIM_VIA_OAUTH_ENABLED is off), so the
       path most owners see. It offers the market's real contact channels and
       says what happens next, rather than promising an email this app does
       not send. */
    <div className="connection-choice">
      <div>
        <span><UserCheck /></span>
        <div>
          <div className="onboarding-title-row"><h3>{t.fimmick.title}</h3><InlineExplainer label={t.fimmick.why} answer={t.fimmick.whyAnswer} locale={locale} /></div>
          <p>{t.fimmick.body}</p>
        </div>
        <CapabilityBadge value="Requires connection" />
      </div>
      <ol className="onboarding-timeline" aria-label={t.fimmick.timelineLabel}>
        {t.fimmick.timeline.map((line, index) => <li key={index}><span aria-hidden="true">{index + 1}</span>{line}</li>)}
      </ol>
      {contacts.length > 0 && <div className="plan-actions">{contacts.map((contact) => <Button key={contact.channel} asChild variant="outline"><a href={contactHref(contact, evidence?.shareSlug)} target={contact.channel === "phone" ? undefined : "_blank"} rel={contact.channel === "phone" ? undefined : "noreferrer"}>{t.fimmick.contacts[contact.channel]}</a></Button>)}</div>}
      {ref && <p className="limitation-note"><TriangleAlert /> {fill(contacts.length > 0 ? t.fimmick.quoteRef : t.fimmick.quoteRefNoContacts, { ref })}</p>}
      {/* P2.4 items 22 and 27: the status of the caller's own request, or the
          form to file one. */}
      {accessRequest}
    </div>
  )
  const brandSummary = existingBrand ? (
    <section className="onboarding-choice" aria-label={t.brandSaved.title}>
      <span className="onboarding-icon"><ShieldCheck /></span>
      <div>
        <h3>{t.brandSaved.title}</h3>
        <dl><div><dt>{t.brandSaved.voice}</dt><dd>{isBrandVoice(saved?.voice) ? voiceLabels[saved.voice] : t.brandSaved.notSet}</dd></div></dl>
        <p>{t.brandSaved.body}</p>
        {saved.approvedClaims ? <details><summary>{t.brandSaved.claims}</summary><ul>{saved.approvedClaims.split("\n").filter(Boolean).map((line, index) => <li key={index}>{line}</li>)}</ul></details> : null}
        {brandHref
          ? <Button asChild type="button" variant="outline"><Link href={brandHref}>{t.brandSaved.open}</Link></Button>
          : <p className="limitation-note">{t.brandSaved.later}</p>}
      </div>
    </section>
  ) : null
  const readFailure = <div ref={errorRef} tabIndex={-1} className="form-error" role="alert">
    <p>{t.errors.readSettings}</p>
    <Link href={reloadHref}>{t.errors.reload}</Link>
  </div>
  const verifiedStrip = ownsWorkspace && (
    <p className="onboarding-verified-strip k-scale-in"><Check aria-hidden="true" />{ownershipLabel}</p>
  )
  const basics = (
    <form id="onboarding-basics" className="onboarding-form" onSubmit={(event) => { event.preventDefault(); void completeWorkspace() }}>
      {verifiedStrip}
      <p>{t.basics.intro}</p>
      <div className="field-stack"><Label htmlFor="workspace-name">{t.basics.businessName}</Label><Input id="workspace-name" value={workspaceName} required maxLength={160} onChange={(event) => setWorkspaceName(event.target.value)} /></div>
      <div className="field-stack"><Label htmlFor="primary-address">{t.basics.address}</Label><Input id="primary-address" value={locationAddress} maxLength={500} onChange={(event) => setLocationAddress(event.target.value)} /></div>
      <p className="limitation-note">{t.basics.connectionsLater}</p>
      {brandSummary}
      <details className="owner-disclosure">
        <summary>{t.basics.moreSettings}</summary>
        <div className="onboarding-form">
          <div className="field-stack"><Label htmlFor="primary-location">{t.basics.primaryLocation}</Label><Input id="primary-location" value={locationOverride ? locationName : workspaceName} maxLength={160} placeholder={workspaceName} onChange={(event) => { setLocationName(event.target.value); setLocationOverride(true) }} /></div>
          <div className="two-column-fields"><div className="field-stack"><Label htmlFor="onboarding-market">{t.basics.market}</Label><Input id="onboarding-market" value={marketName} readOnly /></div><div className="field-stack"><Label htmlFor="onboarding-timezone">{t.basics.timezone}</Label><Input id="onboarding-timezone" value={timezone} readOnly /></div></div>
          {!existingBrand && <>
            <div className="field-stack"><Label htmlFor="onboarding-voice">{t.basics.voice}</Label><Select value={voice} onValueChange={(value) => setVoice(value as BrandVoice)}><SelectTrigger id="onboarding-voice" className="w-full"><SelectValue>{voiceLabels[voice]}</SelectValue></SelectTrigger><SelectContent>{BRAND_VOICE_VALUES.map((key) => <SelectItem key={key} value={key}>{voiceLabels[key]}</SelectItem>)}</SelectContent></Select></div>
            <div className="field-stack"><Label htmlFor="approved-claims">{t.basics.claims}</Label><Textarea id="approved-claims" value={approvedClaims} onChange={(event) => setApprovedClaims(event.target.value)} rows={4} /></div>
            <p className="limitation-note"><TriangleAlert /> {t.basics.factsNote}</p>
          </>}
        </div>
      </details>
      {submitState.kind === "error" && <div ref={errorRef} tabIndex={-1} className="form-error" role="alert"><CircleAlert /> {submitState.message}</div>}
    </form>
  )
  // Signed in is always done here; verify is done once ownership is proven.
  const tracker = [
    { label: t.steps.signedIn, state: "done" as const },
    { label: t.steps.verify, state: step === 1 ? "current" as const : ownsWorkspace ? "done" as const : "todo" as const },
    { label: t.steps.basics, state: step === 2 ? "current" as const : "todo" as const },
  ]

  return (
    <AuthFrame locale={locale}>
      <main className="onboarding-page">
        <div className="onboarding-head">
          <div>
            {ref && <Badge variant="outline">{fill(t.claimBadge, { ref })}</Badge>}
            <h1>{t.title}</h1>
            <p>{t.intro}</p>
            {plan && <Badge>{t.plan.kept} · {plan === "multi" ? t.plan.multi : t.plan.growth}</Badge>}
          </div>
          <Badge variant="outline">{ownershipLabel}</Badge>
        </div>
        <ol className="onboarding-steps" aria-label={t.steps.label}>
          {tracker.map((item, index) => (
            <li key={item.label} data-state={item.state} aria-current={item.state === "current" ? "step" : undefined}>
              <span aria-hidden="true">{item.state === "done" ? <Check /> : index + 1}</span>
              <strong>{item.label}</strong>
              {item.state === "done" && <span className="sr-only"> · {t.steps.done}</span>}
            </li>
          ))}
        </ol>
        <section className="onboarding-card" aria-live="polite">
          <div><span className="step-kicker">{fill(t.steps.stepOf, { n: step + 1, total: STEP_COUNT })}</span><h2 ref={stepTitle} tabIndex={-1}>{stepNames[step - 1]}</h2></div>
          {lookupFailed
            ? <ErrorState locale={locale} body={t.errors.lookup} onRetry={() => router.refresh()} />
            : savedUnavailable ? readFailure : step === 1 ? <>{claimEvidence}{evidence && ownership}</> : basics}
          {evidence && ownsWorkspace && !savedUnavailable && !lookupFailed && <div className="flow-card-footer">
            {step === 2 && <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={submitState.kind === "saving"}>{t.basics.back}</Button>}
            {/* Keep step navigation separate from the submitter during a click. */}
            {step === 1
              ? <Button key="continue" type="button" onClick={() => setStep(2)}>{t.basics.continue}<ArrowRight /></Button>
              : <Button key="finish" form="onboarding-basics" type="submit" disabled={!canContinue || submitState.kind === "saving"}>{submitState.kind === "saving" ? t.basics.saving : t.basics.finish}<ArrowRight /></Button>}
          </div>}
        </section>
      </main>
    </AuthFrame>
  )
}
