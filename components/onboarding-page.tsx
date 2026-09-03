"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowRight, BadgeCheck, Check, CircleAlert, Globe2, ScanSearch, ShieldCheck, TriangleAlert, UserCheck } from "lucide-react"

import { CapabilityBadge, PublicPageFrame } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { PrototypeLocale } from "@/lib/copy"

/** What the server page read from `audit_jobs` for the `claim` slug — public evidence only. */
export type ClaimEvidence = {
  shareSlug: string
  businessName: string | null
  district: string | null
  region: string | null
  workspaceId: string | null
  placeId: string | null
  igHandle: string | null
  websiteUrl: string | null
}

export type OnboardingProps = {
  locale: PrototypeLocale
  claim?: string
  plan?: string
  /** `?claimed=1`: the OAuth claim callback just attached the job. */
  claimed?: boolean
  /** `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED === "true"` on the server. */
  oauthEnabled: boolean
  evidence: ClaimEvidence | null
  /** The caller holds an accepted owner membership on the job's workspace. */
  ownsWorkspace: boolean
  /** An active google_gbp oauth_connections row exists for that workspace. */
  gbpConnected: boolean
}

type BrandVoice = "warm" | "concise" | "playful"

const STEP_COUNT = 4

function marketLabel(region: string | null, isChinese: boolean) {
  const market = region?.toLowerCase() === "tw" ? "tw" : "hk"
  return { market, label: market === "tw" ? (isChinese ? "台灣" : "Taiwan") : (isChinese ? "香港" : "Hong Kong"), timezone: market === "tw" ? "Asia/Taipei" : "Asia/Hong_Kong" }
}

async function readError(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => ({}))) as { error?: unknown }
  return typeof data.error === "string" && data.error ? data.error : fallback
}

/**
 * The four real onboarding steps (CLAUDE.md Phase 2 item 4) in the prototype's
 * step-rail layout: 1 claim evidence from the job, 2 ownership proof (Google
 * OAuth when the flag is on, otherwise Fimmick staff assignment — never an
 * email match, guardrail 15), 3 integrations (GBP state + Instagram handle
 * confirm), 4 brand basics that complete the workspace through
 * `POST /api/workspaces/claim`. Steps 3–4 stay locked until the workspace is
 * attached and owned.
 */
export function OnboardingPage({ locale, claim, plan, claimed = false, oauthEnabled, evidence, ownsWorkspace, gbpConnected }: OnboardingProps) {
  const router = useRouter()
  const isChinese = locale !== "en"
  const { market, label: marketName, timezone } = marketLabel(evidence?.region ?? null, isChinese)
  const [step, setStep] = useState(claimed && ownsWorkspace ? 3 : 1)
  const [workspaceName, setWorkspaceName] = useState(evidence?.businessName ?? "")
  const [locationName, setLocationName] = useState(evidence?.businessName ?? "")
  const [locationAddress, setLocationAddress] = useState(evidence?.district ?? "")
  const [voice, setVoice] = useState<BrandVoice>("warm")
  const [approvedClaims, setApprovedClaims] = useState("")
  const [handle, setHandle] = useState(evidence?.igHandle ?? "")
  const [handleState, setHandleState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; message?: string }>({ kind: "idle" })
  const [submitState, setSubmitState] = useState<{ kind: "idle" | "saving" | "error"; message?: string }>({ kind: "idle" })

  const steps = isChinese ? ["驗證認領", "驗證擁有權", "連接來源", "品牌基本資料"] : ["Verify claim", "Verify ownership", "Connections", "Brand basics"]
  const ownershipLabel = ownsWorkspace
    ? (gbpConnected ? (isChinese ? "已透過 Google 驗證" : "Verified with Google") : (isChinese ? "由 Fimmick 指派" : "Assigned by Fimmick"))
    : (isChinese ? "等待驗證" : "Pending verification")
  const voiceLabels: Record<BrandVoice, string> = {
    warm: isChinese ? "親切、本地、真誠" : "Warm, local and sincere",
    concise: isChinese ? "簡潔、專業" : "Concise and professional",
    playful: isChinese ? "活潑、有活力" : "Playful and energetic",
  }
  const canContinue = step === 1 ? Boolean(evidence) : step === 2 ? ownsWorkspace : step === 3 ? ownsWorkspace : ownsWorkspace && workspaceName.trim().length > 0 && locationName.trim().length > 0

  async function saveHandle() {
    if (!evidence?.workspaceId) return
    const trimmed = handle.trim()
    if (!trimmed) {
      setHandleState({ kind: "error", message: isChinese ? "請輸入 Instagram 帳號。" : "Enter the Instagram handle." })
      return
    }
    setHandleState({ kind: "saving" })
    try {
      const response = await fetch(`/api/workspaces/${evidence.workspaceId}/instagram-handle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: trimmed }),
      })
      if (response.ok) {
        const data = (await response.json().catch(() => ({}))) as { handle?: string }
        if (typeof data.handle === "string") setHandle(data.handle)
        setHandleState({ kind: "saved" })
        return
      }
      const code = await readError(response, "unavailable")
      setHandleState({ kind: "error", message: code === "handle is invalid" ? (isChinese ? "Instagram 帳號格式無效。" : "That Instagram handle is not valid.") : (isChinese ? "暫時未能儲存，請稍後再試。" : "Could not save right now. Try again shortly.") })
    } catch {
      setHandleState({ kind: "error", message: isChinese ? "網絡連線失敗，請檢查後再試。" : "Network error. Check your connection and try again." })
    }
  }

  async function completeWorkspace() {
    if (!evidence) return
    setSubmitState({ kind: "saving" })
    try {
      const response = await fetch("/api/workspaces/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim_slug: evidence.shareSlug,
          workspace_name: workspaceName.trim(),
          primary_location: { name: locationName.trim(), address: locationAddress.trim() || null },
          market,
          timezone,
          locale,
          brand_voice: voice,
          approved_claims: approvedClaims.split("\n").map((line) => line.trim()).filter(Boolean),
        }),
      })
      const data = (await response.json().catch(() => ({}))) as { slug?: string; workspaceSlug?: string; workspace?: { slug?: string }; error?: string }
      if (!response.ok) {
        setSubmitState({ kind: "error", message: response.status === 403 ? (isChinese ? "只有已驗證的店主可以完成這個工作台。" : "Only the verified owner can complete this workspace.") : (isChinese ? "暫時未能完成設定，請稍後再試。" : "Could not complete the workspace right now. Try again shortly.") })
        return
      }
      const slug = data.slug ?? data.workspaceSlug ?? data.workspace?.slug
      router.push(slug ? `/${locale}/owner/${slug}` : `/${locale}/owner/select-workspace`)
    } catch {
      setSubmitState({ kind: "error", message: isChinese ? "網絡連線失敗，請檢查後再試。" : "Network error. Check your connection and try again." })
    }
  }

  let body: React.ReactNode
  if (step === 1) {
    body = evidence ? (
      <div className="onboarding-choice"><span className="onboarding-icon"><BadgeCheck /></span><div><Badge variant="outline">{isChinese ? "認領證據" : "Claim evidence"}</Badge><h2>{isChinese ? `確認${evidence.businessName ?? "商戶"}` : `Confirm ${evidence.businessName ?? "this business"}`}</h2><p>{[evidence.district, marketName].filter(Boolean).join(" · ")}</p><dl><div><dt>{isChinese ? "擁有權" : "Ownership"}</dt><dd>{ownershipLabel}</dd></div><div><dt>{isChinese ? "公開報告" : "Public report"}</dt><dd><Link href={`/${locale}/r/${evidence.shareSlug}`}>{evidence.shareSlug}</Link></dd></div>{evidence.igHandle && <div><dt>Instagram</dt><dd>@{evidence.igHandle}</dd></div>}{evidence.websiteUrl && <div><dt>{isChinese ? "網站" : "Website"}</dt><dd>{evidence.websiteUrl}</dd></div>}</dl></div></div>
    ) : (
      <div className="onboarding-choice"><span className="onboarding-icon"><ScanSearch /></span><div><Badge variant="outline">{isChinese ? "沒有認領中的報告" : "No report to claim"}</Badge><h2>{isChinese ? "先由一次掃描開始" : "Start from a scan"}</h2><p>{isChinese ? "工作台是由一份掃描報告建立的。先免費掃描你的商戶並解鎖報告，然後從報告頁繼續認領。" : "A workspace starts from a scan report. Run a free scan of your business, unlock the report, then continue the claim from the report page."}</p><Button asChild><Link href={`/${locale}/scan`}><ScanSearch />{isChinese ? "免費掃描" : "Free scan"}<ArrowRight /></Link></Button></div></div>
    )
  } else if (step === 2) {
    body = ownsWorkspace ? (
      <div className="onboarding-choice"><span className="onboarding-icon"><ShieldCheck /></span><div><Badge variant="outline">{ownershipLabel}</Badge><h2>{isChinese ? "擁有權已確認" : "Ownership confirmed"}</h2><p>{isChinese ? "這份報告已附加到你擁有的工作台。你可以繼續設定連接與品牌資料。" : "This report is attached to a workspace you own. Continue to connections and brand basics."}</p></div></div>
    ) : oauthEnabled && claim ? (
      <div className="connection-choice"><div><span><Globe2 /></span><div><h3>{isChinese ? "以 Google 驗證擁有權" : "Verify ownership with Google"}</h3><p>{isChinese ? "使用管理這個商戶 Google Business Profile 的 Google 帳戶登入。Google 會證明你管理該檔案，我們才會建立工作台並附加報告。不會啟用直接發佈。" : "Sign in with the Google account that manages this business’s Business Profile. Google attests that you manage it; only then is the workspace created and the report attached. Direct publishing is not enabled."}</p></div><CapabilityBadge value="Live" /></div><Button asChild><a href={`/api/oauth/google/claim/start?slug=${encodeURIComponent(claim)}&locale=${locale}`}><ShieldCheck />{isChinese ? "以 Google 驗證" : "Verify with Google"}<ArrowRight /></a></Button><p className="limitation-note"><TriangleAlert /> {isChinese ? "我們只會讀取商戶檔案，並可隨時在設定中斷開連接。" : "We only read the Business Profile; you can disconnect at any time in settings."}</p></div>
    ) : (
      <div className="connection-choice"><div><span><UserCheck /></span><div><h3>{isChinese ? "請 Fimmick 指派你的工作台" : "Ask Fimmick to assign your workspace"}</h3><p>{isChinese ? "擁有權必須經過驗證，不能自行聲明，我們亦不會憑電郵配對。Fimmick 團隊核實你與商戶的關係後，會把這份報告指派到你的工作台；完成後你會收到電郵，並可在此繼續。" : "Ownership is proven, never self-declared, and we do not match on email. The Fimmick team verifies your relationship with the business and assigns this report to your workspace; you will be emailed when it is done and can continue here."}</p></div><CapabilityBadge value="Requires connection" /></div><p className="limitation-note"><TriangleAlert /> {isChinese ? "回覆你收到的報告電郵，或聯絡 Fimmick 團隊並附上報告編號。" : "Reply to the report email you received, or contact the Fimmick team quoting the report reference."}{evidence ? ` · ${evidence.shareSlug}` : ""}</p></div>
    )
  } else if (step === 3) {
    body = (
      <div className="onboarding-form">
        <div className="connection-choice"><div><span><Globe2 /></span><div><h3>Google Business Profile</h3><p>{gbpConnected ? (isChinese ? "已連接。讀取商戶檔案及評論證據；不會啟用直接發佈。" : "Connected. Reads profile and review evidence; direct publishing is not enabled.") : (isChinese ? "讀取商戶檔案及評論證據；可稍後在「連接與整合」設定中連接。" : "Reads profile and review evidence. Connect later under Integrations.")}</p></div><CapabilityBadge value={gbpConnected ? "Live" : "Requires connection"} /></div></div>
        <div className="field-stack"><Label htmlFor="instagram-handle">{isChinese ? "確認 Instagram 帳號" : "Confirm Instagram handle"}</Label><Input id="instagram-handle" value={handle} onChange={(event) => { setHandle(event.target.value); setHandleState({ kind: "idle" }) }} placeholder="@yourbusiness" autoComplete="off" /></div>
        {handleState.kind === "error" && <div className="form-error" role="alert"><CircleAlert /> {handleState.message}</div>}
        {handleState.kind === "saved" && <p className="limitation-note"><Check /> {isChinese ? "已儲存 Instagram 帳號。" : "Instagram handle saved."}</p>}
        <div className="flow-card-footer"><Button variant="outline" type="button" onClick={saveHandle} disabled={!evidence?.workspaceId || handleState.kind === "saving"}>{handleState.kind === "saving" ? (isChinese ? "儲存中…" : "Saving…") : (isChinese ? "儲存帳號" : "Save handle")}</Button><button className="text-action" type="button" onClick={() => setStep(4)}>{isChinese ? "暫時略過並只保留匯出" : "Skip for now and keep export-only"}</button></div>
      </div>
    )
  } else {
    body = (
      <div className="onboarding-form">
        <div className="field-stack"><Label htmlFor="workspace-name">{isChinese ? "工作台名稱" : "Workspace name"}</Label><Input id="workspace-name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} /></div>
        <div className="two-column-fields"><div className="field-stack"><Label htmlFor="primary-location">{isChinese ? "主要地點" : "Primary location"}</Label><Input id="primary-location" value={locationName} onChange={(event) => setLocationName(event.target.value)} /></div><div className="field-stack"><Label htmlFor="primary-address">{isChinese ? "地址" : "Address"}</Label><Input id="primary-address" value={locationAddress} onChange={(event) => setLocationAddress(event.target.value)} /></div></div>
        <div className="two-column-fields"><div className="field-stack"><Label htmlFor="onboarding-market">{isChinese ? "市場" : "Market"}</Label><Input id="onboarding-market" value={marketName} readOnly /></div><div className="field-stack"><Label htmlFor="onboarding-timezone">{isChinese ? "時區" : "Timezone"}</Label><Input id="onboarding-timezone" value={timezone} readOnly /></div></div>
        <div className="field-stack"><Label htmlFor="onboarding-voice">{isChinese ? "品牌語氣" : "Brand voice"}</Label><Select value={voice} onValueChange={(value) => setVoice(value as BrandVoice)}><SelectTrigger id="onboarding-voice" className="w-full"><SelectValue>{voiceLabels[voice]}</SelectValue></SelectTrigger><SelectContent>{(Object.keys(voiceLabels) as BrandVoice[]).map((key) => <SelectItem key={key} value={key}>{voiceLabels[key]}</SelectItem>)}</SelectContent></Select></div>
        <div className="field-stack"><Label htmlFor="approved-claims">{isChinese ? "已核准事實描述（每行一項）" : "Approved factual claims (one per line)"}</Label><Textarea id="approved-claims" value={approvedClaims} onChange={(event) => setApprovedClaims(event.target.value)} rows={4} /></div>
        {submitState.kind === "error" && <div className="form-error" role="alert"><CircleAlert /> {submitState.message}</div>}
        <p className="limitation-note"><TriangleAlert /> {isChinese ? "餐牌材料、致敏原、價格及法律聲明必須由店主確認。" : "Menu ingredients, allergens, prices and legal claims always require owner confirmation."}</p>
      </div>
    )
  }

  return (
    <PublicPageFrame locale={locale}>
      <main className="onboarding-page"><div className="onboarding-head"><div><Badge variant="outline">{isChinese ? "延續認領流程" : "Claim continuation"}{claim ? ` · ${claim}` : ""}</Badge><h1>{isChinese ? "設定你的能見度工作台" : "Set up your visibility workspace"}</h1><p>{isChinese ? "4 個聚焦步驟，將市場、語言及權限分開設定。" : "Four focused steps, with market, language and permissions kept separate."}</p>{plan && <Badge>{isChinese ? "已保留所選方案" : "Selected plan preserved"} · {plan === "multi" ? (isChinese ? "多地點" : "Multi-location") : (isChinese ? "增長工作台" : "Growth Workspace")}</Badge>}</div><Badge variant="outline">{ownershipLabel}</Badge></div><div className="onboarding-layout"><aside><ol>{steps.map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined} aria-disabled={index >= 2 && !ownsWorkspace ? true : undefined} className={step === index + 1 ? "is-active" : step > index + 1 ? "is-complete" : ""}><span>{step > index + 1 ? <Check /> : index + 1}</span><strong>{label}</strong></li>)}</ol></aside><section className="onboarding-card" aria-live="polite"><div><span className="step-kicker">{isChinese ? `第 ${step} 步，共 ${STEP_COUNT} 步` : `Step ${step} of ${STEP_COUNT}`}</span><h2>{steps[step - 1]}</h2></div>{body}<div className="flow-card-footer"><Button variant="outline" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}>{isChinese ? "返回" : "Back"}</Button><Button disabled={!canContinue || submitState.kind === "saving"} onClick={() => { if (step < STEP_COUNT) setStep(step + 1); else void completeWorkspace() }}>{isChinese ? (step < STEP_COUNT ? "繼續" : submitState.kind === "saving" ? "建立中…" : "開啟工作台") : (step < STEP_COUNT ? "Continue" : submitState.kind === "saving" ? "Creating…" : "Open workspace")}<ArrowRight /></Button></div></section></div></main>
    </PublicPageFrame>
  )
}
