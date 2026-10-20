"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { ArrowRight, BadgeCheck, Check, CircleAlert, Globe2, ScanSearch, ShieldCheck, TriangleAlert, UserCheck } from "lucide-react"

import { CapabilityBadge, PublicPageFrame } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { PrototypeLocale } from "@/lib/copy"
import { t } from "@/lib/i18n"
import { zhFor } from "@/lib/zh-tw"

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
}

// Must stay a subset of lib/workspace/brand.ts's BRAND_VOICES -- the server
// validates against that set, so a value only this file knows about is dropped.
type BrandVoice = "warm" | "professional" | "playful" | "direct"

const BRAND_VOICE_VALUES: readonly BrandVoice[] = ["warm", "professional", "playful", "direct"]

/** A stored voice this build does not know about must not become a dead Select value. */
function isBrandVoice(value: string | null | undefined): value is BrandVoice {
  return typeof value === "string" && (BRAND_VOICE_VALUES as readonly string[]).includes(value)
}

const STEP_COUNT = 2

function marketLabel(region: string | null, isChinese: boolean) {
  const market = region?.toLowerCase() === "tw" ? "tw" : "hk"
  return { market, label: market === "tw" ? (isChinese ? "台灣" : "Taiwan") : (isChinese ? "香港" : "Hong Kong"), timezone: market === "tw" ? "Asia/Taipei" : "Asia/Hong_Kong" }
}

const CONTACT_LABELS = {
  whatsapp: { zh: "WhatsApp 聯絡", en: "Contact on WhatsApp" },
  line: { zh: "LINE 聯絡", en: "Contact on LINE" },
  phone: { zh: "致電查詢", en: "Call us" },
  email: { zh: "電郵查詢", en: "Email us" },
} as const

/**
 * Carry the report reference into the channel where the channel supports it,
 * so staff can find the scan without the owner retyping the slug. Phone and
 * LINE take no prefill, and the reference is printed beside the buttons for
 * every channel regardless.
 */
function contactHref(contact: { channel: keyof typeof CONTACT_LABELS; href: string }, shareSlug: string | undefined): string {
  if (!shareSlug) return contact.href
  if (contact.channel === "whatsapp") return `${contact.href}?text=${encodeURIComponent(`Workspace assignment request - report ${shareSlug}`)}`
  if (contact.channel === "email") return `${contact.href}?subject=${encodeURIComponent(`Workspace assignment request - report ${shareSlug}`)}`
  return contact.href
}

/**
 * Two steps: business + verified access, then prefilled essentials. Connections
 * can be managed later in workspace settings. Claim completion still uses the
 * owner-only endpoint; optional configuration never replaces ownership proof.
 */
export function OnboardingPage(props: OnboardingProps) {
  // A failed read must not seed the recovered editor from scan guesses.
  // Ordinary same-scope refreshes still preserve an in-progress draft.
  return <OnboardingForm key={[props.scopeKey, props.claim, props.evidence?.workspaceId, props.ownsWorkspace, props.savedUnavailable === true].join(":")} {...props} />
}

function OnboardingForm({ locale, claim, plan, resumeStep, saved = null, savedUnavailable = false, oauthEnabled, contacts = [], evidence, ownsWorkspace, gbpConnected, accessRequest }: OnboardingProps) {
  const router = useRouter()
  const isChinese = locale !== "en"
  const { market, label: marketName, timezone } = marketLabel(evidence?.region ?? null, isChinese)
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

  const steps = [t(locale, "onboarding.verifyStep"), t(locale, "onboarding.basicsStep")]
  const ownershipLabel = ownsWorkspace
    ? (gbpConnected ? (isChinese ? "已透過 Google 驗證" : "Verified with Google") : (isChinese ? "由 Fimmick 指派" : "Assigned by Fimmick"))
    : (isChinese ? "等待驗證" : "Pending verification")
  const voiceLabels: Record<BrandVoice, string> = {
    warm: isChinese ? "親切、本地、真誠" : "Warm, local and sincere",
    professional: isChinese ? "簡潔、專業" : "Concise and professional",
    playful: isChinese ? "活潑、有活力" : "Playful and energetic",
    direct: isChinese ? "直接、務實" : "Direct and matter-of-fact",
  }
  // Optional override: blank means "use the business name", so clearing a
  // field inside the collapsed disclosure can never silently block completion.
  const effectiveLocationName = locationOverride && locationName.trim() ? locationName.trim() : workspaceName.trim()
  const existingBrand = ownsWorkspace && saved?.brandProfileExists === true
  const brandHref = saved?.workspaceSlug && /^[a-z0-9_-]+$/i.test(saved.workspaceSlug)
    ? `/${locale}/owner/${encodeURIComponent(saved.workspaceSlug)}/business/profile` : null
  const reloadHref = `/${locale}/owner/onboarding${claim ? `?claim=${encodeURIComponent(claim)}` : ""}`
  const canContinue = !savedUnavailable && Boolean(evidence) && ownsWorkspace && (step === 1 || workspaceName.trim().length > 0)

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
        setSubmitState({ kind: "error", message: response.status === 403 ? (isChinese ? zhFor(locale, "只有已驗證的店主可以完成這個工作台。") : "Only the verified owner can complete this workspace.") : (isChinese ? "暫時未能完成設定，請稍後再試。" : "Could not complete the workspace right now. Try again shortly.") })
        return
      }
      const slug = typeof data?.workspaceSlug === "string" ? data.workspaceSlug.trim() : ""
      if (!slug || !/^[a-z0-9_-]+$/i.test(slug)) {
        setSubmitState({ kind: "error", message: t(locale, "onboarding.resultUnavailable") })
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
      if (!controller.signal.aborted) setSubmitState({ kind: "error", message: isChinese ? "網絡連線失敗，請檢查後再試。" : "Network error. Check your connection and try again." })
    } finally {
      if (!completed && pending.current === controller) pending.current = null
    }
  }

  const claimEvidence = evidence ? (
      <div className="onboarding-choice"><span className="onboarding-icon"><BadgeCheck /></span><div><Badge variant="outline">{isChinese ? "認領證據" : "Claim evidence"}</Badge><h2>{isChinese ? zhFor(locale, `確認${evidence.businessName ?? "商戶"}`) : `Confirm ${evidence.businessName ?? "this business"}`}</h2><p>{[evidence.district, marketName].filter(Boolean).join(" · ")}</p><dl><div><dt>{isChinese ? "擁有權" : "Ownership"}</dt><dd>{ownershipLabel}</dd></div><div><dt>{isChinese ? "公開報告" : "Public report"}</dt><dd><Link href={`/${locale}/r/${evidence.shareSlug}`}>{t(locale, "onboarding.viewReport")}</Link></dd></div>{evidence.igHandle && <div><dt>Instagram</dt><dd>@{evidence.igHandle}</dd></div>}{evidence.websiteUrl && <div><dt>{isChinese ? "網站" : "Website"}</dt><dd>{evidence.websiteUrl}</dd></div>}</dl>
        {/* The escape the pre-claim /scan flow has and this one did not. Before
            anything is attached it is a plain link -- no mutation. Once the
            report IS attached, detaching is not self-service: ownership is
            proven, never self-declared, and undoing it the same way would be a
            hijack primitive. */}
        {ownsWorkspace ? (
          <p className="limitation-note"><TriangleAlert /> {isChinese ? zhFor(locale, "如果這不是你的商戶：報告已附加到這個工作台，我們不會自助解除。請聯絡 Fimmick 團隊並附上報告編號更正。") : "If this is not your business: the report is already attached to this workspace and we do not detach it self-service. Contact the Fimmick team quoting the report reference to correct it."}{` · ${evidence.shareSlug}`}</p>
        ) : (
          <p className="limitation-note"><Link href={`/${locale}/scan`}>{isChinese ? zhFor(locale, "這不是我的商戶 — 改為掃描正確的商戶") : "This is not my business — scan the right one instead"}</Link></p>
        )}</div></div>
    ) : (
      <div className="onboarding-choice"><span className="onboarding-icon"><ScanSearch /></span><div><Badge variant="outline">{isChinese ? "沒有認領中的報告" : "No report to claim"}</Badge><h2>{isChinese ? "先由一次掃描開始" : "Start from a scan"}</h2><p>{isChinese ? zhFor(locale, "工作台是由一份掃描報告建立的。先免費掃描你的商戶並解鎖報告，然後從報告頁繼續認領。") : "A workspace starts from a scan report. Run a free scan of your business, unlock the report, then continue the claim from the report page."}</p><Button asChild><Link href={`/${locale}/scan`}><ScanSearch />{isChinese ? "免費掃描" : "Free scan"}<ArrowRight /></Link></Button></div></div>
    )
  const ownership = ownsWorkspace ? (
      <div className="onboarding-choice"><span className="onboarding-icon"><ShieldCheck /></span><div><Badge variant="outline">{ownershipLabel}</Badge><h2>{isChinese ? "擁有權已確認" : "Ownership confirmed"}</h2><p>{t(locale, "onboarding.ownershipReady")}</p></div></div>
    ) : oauthEnabled && claim ? (
      <div className="connection-choice"><div><span><Globe2 /></span><div><h3>{isChinese ? "以 Google 驗證擁有權" : "Verify ownership with Google"}</h3><p>{isChinese ? zhFor(locale, "使用管理這個商戶 Google Business Profile 的 Google 帳戶登入。Google 會證明你管理該檔案，我們才會建立工作台並附加報告。不會啟用直接發佈。") : "Sign in with the Google account that manages this business’s Business Profile. Google attests that you manage it; only then is the workspace created and the report attached. Direct publishing is not enabled."}</p></div><CapabilityBadge value="Live" /></div><Button asChild><a href={`/api/oauth/google/claim/start?slug=${encodeURIComponent(claim)}&locale=${locale}`}><ShieldCheck />{isChinese ? "以 Google 驗證擁有權" : "Verify ownership with Google"}<ArrowRight /></a></Button><p className="limitation-note"><TriangleAlert /> {/* This promised a control that did not exist. It does now --
    Settings > Integrations > Disconnect -- so the sentence names
    where it is instead of gesturing at "settings". */}
{isChinese ? zhFor(locale, "我們只會讀取商戶檔案。你可以隨時在「設定 › 連接與整合」解除連接，我們儲存的憑證會被刪除。") : "We only read the Business Profile. You can disconnect at any time under Settings › Integrations, which deletes the credential we store."}</p></div>
    ) : (
      /* This branch renders whenever OAuth claim is off, which is the shipped
         default (`.env.example` sets WORKSPACE_CLAIM_VIA_OAUTH_ENABLED=false),
         so it is the path most owners actually see. It used to say "you will
         be emailed when it is done" and "Reply to the report email you
         received" -- this app sends neither, leaving the owner with no next
         move. It now offers the market's real contact channels and says what
         to do when the assignment lands. */
      <div className="connection-choice"><div><span><UserCheck /></span><div><h3>{isChinese ? "請 Fimmick 指派你的工作台" : "Ask Fimmick to assign your workspace"}</h3><p>{isChinese ? zhFor(locale, "擁有權必須經過驗證，不能自行聲明，我們亦不會憑電郵配對。Fimmick 團隊核實你與商戶的關係後，會把這份報告指派到你的工作台。指派完成後回到這一頁，餘下步驟就會解鎖。") : "Ownership is proven, never self-declared, and we do not match on email. The Fimmick team verifies your relationship with the business and assigns this report to your workspace. Once it is assigned, return to this page and the remaining steps unlock."}</p></div><CapabilityBadge value="Requires connection" /></div>
        {contacts.length > 0 && <div className="plan-actions">{contacts.map((contact) => <Button key={contact.channel} asChild variant="outline"><a href={contactHref(contact, evidence?.shareSlug)} target={contact.channel === "phone" ? undefined : "_blank"} rel={contact.channel === "phone" ? undefined : "noreferrer"}>{CONTACT_LABELS[contact.channel][isChinese ? "zh" : "en"]}</a></Button>)}</div>}
        <p className="limitation-note"><TriangleAlert /> {contacts.length > 0 ? (isChinese ? "聯絡時請提供下列報告編號。" : "Quote this report reference when you get in touch.") : (isChinese ? "請聯絡你的 Fimmick 對接人並提供下列報告編號。" : "Contact your Fimmick representative and quote this report reference.")}{evidence ? ` · ${evidence.shareSlug}` : ""}</p>
        {/* P2.4 items 22 and 27: the status of the caller's own request, or the
            form to file one. Before this, an owner without a Google-verifiable
            listing could only be told to get in touch out of band. */}
        {accessRequest}</div>
    )
  const brandSummary = existingBrand ? (
    <section className="onboarding-choice" aria-label={isChinese ? "已儲存的品牌設定" : "Saved brand settings"}>
      <span className="onboarding-icon"><ShieldCheck /></span>
      <div>
        <h3>{isChinese ? "已儲存的品牌設定" : "Saved brand settings"}</h3>
        <dl><div><dt>{isChinese ? "品牌語氣" : "Brand voice"}</dt><dd>{isBrandVoice(saved?.voice) ? voiceLabels[saved.voice] : isChinese ? "未設定" : "Not set"}</dd></div></dl>
        <p>{isChinese ? "這裡會保留現有品牌資料。如需修改，請前往品牌設定。" : "Your existing brand profile is preserved here. To make changes, open brand settings."}</p>
        {saved.approvedClaims ? <details><summary>{isChinese ? "已儲存的事實描述" : "Saved factual claims"}</summary><ul>{saved.approvedClaims.split("\n").filter(Boolean).map((line, index) => <li key={index}>{line}</li>)}</ul></details> : null}
        {brandHref
          ? <Button asChild type="button" variant="outline"><Link href={brandHref}>{isChinese ? "前往品牌設定" : "Open brand settings"}</Link></Button>
          : <p className="limitation-note">{isChinese ? "完成商戶設定後，可從工作台開啟品牌設定。" : "After completing business setup, open brand settings from the workspace."}</p>}
      </div>
    </section>
  ) : null
  const readFailure = <div ref={errorRef} tabIndex={-1} className="form-error" role="alert">
    <p>{isChinese ? "暫時未能讀取現有設定。請重新載入後再繼續。" : "We could not read the current settings. Reload before continuing."}</p>
    <Link href={reloadHref}>{isChinese ? "重新載入設定" : "Reload settings"}</Link>
  </div>
  const basics = (
      <form id="onboarding-basics" className="onboarding-form" onSubmit={(event) => { event.preventDefault(); void completeWorkspace() }}>
        <p>{t(locale, "onboarding.basicsIntro")}</p>
        <div className="field-stack"><Label htmlFor="workspace-name">{t(locale, "onboarding.businessName")}</Label><Input id="workspace-name" value={workspaceName} required maxLength={160} onChange={(event) => setWorkspaceName(event.target.value)} /></div>
        <div className="field-stack"><Label htmlFor="primary-address">{t(locale, "onboarding.address")}</Label><Input id="primary-address" value={locationAddress} maxLength={500} onChange={(event) => setLocationAddress(event.target.value)} /></div>
        <p className="limitation-note">{t(locale, "onboarding.connectionsLater")}</p>
        {brandSummary}
        <details className="owner-disclosure">
          <summary>{t(locale, "onboarding.moreSettings")}</summary>
          <div className="onboarding-form">
        <div className="field-stack"><Label htmlFor="primary-location">{isChinese ? zhFor(locale, "主要地點") : "Primary location"}</Label><Input id="primary-location" value={locationOverride ? locationName : workspaceName} maxLength={160} placeholder={workspaceName} onChange={(event) => { setLocationName(event.target.value); setLocationOverride(true) }} /></div>
        <div className="two-column-fields"><div className="field-stack"><Label htmlFor="onboarding-market">{isChinese ? "市場" : "Market"}</Label><Input id="onboarding-market" value={marketName} readOnly /></div><div className="field-stack"><Label htmlFor="onboarding-timezone">{isChinese ? "時區" : "Timezone"}</Label><Input id="onboarding-timezone" value={timezone} readOnly /></div></div>
        {!existingBrand && <><div className="field-stack"><Label htmlFor="onboarding-voice">{isChinese ? "品牌語氣" : "Brand voice"}</Label><Select value={voice} onValueChange={(value) => setVoice(value as BrandVoice)}><SelectTrigger id="onboarding-voice" className="w-full"><SelectValue>{voiceLabels[voice]}</SelectValue></SelectTrigger><SelectContent>{(Object.keys(voiceLabels) as BrandVoice[]).map((key) => <SelectItem key={key} value={key}>{voiceLabels[key]}</SelectItem>)}</SelectContent></Select></div>
        <div className="field-stack"><Label htmlFor="approved-claims">{isChinese ? "已核准事實描述（每行一項）" : "Approved factual claims (one per line)"}</Label><Textarea id="approved-claims" value={approvedClaims} onChange={(event) => setApprovedClaims(event.target.value)} rows={4} /></div>
        <p className="limitation-note"><TriangleAlert /> {isChinese ? zhFor(locale, "餐牌材料、致敏原、價格及法律聲明必須由店主確認。") : "Menu ingredients, allergens, prices and legal claims always require owner confirmation."}</p></>}
          </div>
        </details>
        {submitState.kind === "error" && <div ref={errorRef} tabIndex={-1} className="form-error" role="alert"><CircleAlert /> {submitState.message}</div>}
      </form>
    )

  return (
    <PublicPageFrame locale={locale}>
      <main className="onboarding-page">
        <div className="onboarding-head"><div><Badge variant="outline">{isChinese ? "延續認領流程" : "Claim continuation"}{claim ? ` · ${claim}` : ""}</Badge><h1>{t(locale, "onboarding.title")}</h1><p>{t(locale, "onboarding.intro")}</p>{plan && <Badge>{isChinese ? "已保留所選方案" : "Selected plan preserved"} · {plan === "multi" ? (isChinese ? zhFor(locale, "多地點") : "Multi-location") : (isChinese ? zhFor(locale, "增長工作台") : "Growth Workspace")}</Badge>}</div><Badge variant="outline">{ownershipLabel}</Badge></div>
        <div className="onboarding-layout">
          <aside><ol>{steps.map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined} aria-disabled={index === 1 && !ownsWorkspace ? true : undefined} className={step === index + 1 ? "is-active" : step > index + 1 ? "is-complete" : ""}><span>{step > index + 1 ? <Check /> : index + 1}</span><strong>{label}</strong></li>)}</ol></aside>
          <section className="onboarding-card" aria-live="polite">
            <div><span className="step-kicker">{isChinese ? `第 ${step} 步，共 ${STEP_COUNT} 步` : `Step ${step} of ${STEP_COUNT}`}</span><h2 ref={stepTitle} tabIndex={-1}>{steps[step - 1]}</h2></div>
            {savedUnavailable ? readFailure : step === 1 ? <>{claimEvidence}{evidence && ownership}</> : basics}
            {evidence && ownsWorkspace && !savedUnavailable && <div className="flow-card-footer">
              {step === 2 && <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={submitState.kind === "saving"}>{isChinese ? "返回" : "Back"}</Button>}
              {/* Keep step navigation separate from the submitter during a click. */}
              {step === 1
                ? <Button key="continue" type="button" onClick={() => setStep(2)}>{isChinese ? "繼續" : "Continue"}<ArrowRight /></Button>
                : <Button key="finish" form="onboarding-basics" type="submit" disabled={!canContinue || submitState.kind === "saving"}>{t(locale, submitState.kind === "saving" ? "onboarding.saving" : "onboarding.finish")}<ArrowRight /></Button>}
            </div>}
          </section>
        </div>
      </main>
    </PublicPageFrame>
  )
}
