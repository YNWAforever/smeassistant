"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronRight, FileImage, Globe, Image as ImageIcon, Languages, LoaderCircle, MapPinned, MessageSquareText,
  Newspaper, Search, Sparkles, Star, UserRoundPen, WandSparkles, XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { RoleNotice } from "@/components/states/role-notice"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ContextualAssistant } from "@/components/pocket-assistant/assistant-launcher"
import { CapabilityBadge, FactType, PageIntro, SectionCard } from "@/components/product-ui"
import { LocationSelect } from "@/components/workspace/location-select"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { type FactType as EvidenceFactType } from "@/lib/domain"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import { createObjectiveAction } from "@/lib/workspace/client"
import { effortLabel, withLocation } from "@/lib/workspace/format"
import { isOfferTemplate, TEMPLATES, type OfferTemplateKey, type TemplateKey } from "@/lib/workspace/templates"
import { t } from "@/lib/i18n"
import { fill } from "@/lib/copy-ui"

export interface CreateViewProps {
  locale: PrototypeLocale
  workspaceSlug: string
  workspaceId: string
  role: WorkspaceRole
  inScope: boolean
  location: string
  locationId: string | null
  locations: Array<{ slug: string; name: string }>
  /** Open actions in the scoped location: template → { id, evidence detail }. Marks a goal "evidence-led". */
  openActions: Array<{ id: string; templateKey: TemplateKey; evidence: string; freshness: string; factType?:EvidenceFactType; source?:string }>
}

const ICONS: Record<Exclude<TemplateKey, OfferTemplateKey>, typeof MessageSquareText> = {
  "review-response": MessageSquareText,
  "review-request": Star,
  "gbp-profile-fix": MapPinned,
  "gbp-photo-pack": ImageIcon,
  "gbp-post": Newspaper,
  "social-post": FileImage,
  "ig-bio": UserRoundPen,
  "ig-highlights": Sparkles,
  "visibility-content": Search,
  "website-basics": Globe,
  "local-seo-brief": Search,
  "menu-translation": Languages,
  "google-reconnect": Globe,
}

/**
 * Goals the owner can start from an objective: every template with an agent
 * (system/checklist templates come from evidence only). Offer-backed templates
 * are excluded: they need a confirmed offer and are created from Offers.
 */
const GOALS = TEMPLATES.filter(
  (template): template is typeof template & { key: Exclude<TemplateKey, OfferTemplateKey> } =>
    template.agentKey !== null && !isOfferTemplate(template),
)

/**
 * P2.1 item 1: Create leads with the three workflows Phase 2 completes end to
 * end — review reply, FAQ + JSON-LD and website basics. Everything else stays
 * reachable in the same tab, below them, rather than competing for the same
 * attention in one flat grid.
 */
const LEAD_KEYS: readonly TemplateKey[] = ["review-response", "visibility-content", "website-basics"]
const LEAD_GOALS = GOALS.filter((goal) => LEAD_KEYS.includes(goal.key))
const SECONDARY_GOALS = GOALS.filter((goal) => !LEAD_KEYS.includes(goal.key))
/** Lead-first everywhere, so the recommended tab and the full list agree on order. */
const ORDERED_GOALS = [...LEAD_GOALS, ...SECONDARY_GOALS]

export function CreateView({ locale, workspaceSlug, workspaceId, role, inScope, location, locationId, locations, openActions }: CreateViewProps) {
  const pc = copy[locale].workspaceActions.create
  const router = useRouter()
  const base = `/${locale}/owner/${workspaceSlug}`
  const labels = copy[locale].workspace.templates
  const inputs = copy[locale].workspace.inputs
  const openByTemplate = new Map(openActions.map((a) => [a.templateKey, a]))
  const recommended = ORDERED_GOALS.filter((goal) => openByTemplate.has(goal.key))
  const [tab, setTab] = useState(recommended.length ? "recommended" : "all")
  const [selectedKey, setSelectedKey] = useState<TemplateKey>((recommended[0] ?? ORDERED_GOALS[0]).key)
  const [objective, setObjective] = useState("")
  const [stage, setStage] = useState<"idle" | "queued" | "failed">("idle")
  const [failure, setFailure] = useState<string | null>(null)
  const selected = ORDERED_GOALS.find((goal) => goal.key === selectedKey) ?? ORDERED_GOALS[0]
  const existing = openByTemplate.get(selected.key) ?? null
  const canCreate = role !== "viewer" && inScope
  const objectiveTooShort = objective.trim().length < 8

  async function startDraft() {
    if (!canCreate) return
    if (objectiveTooShort) {
      toast.error(pc.describeTheObjectiveIn)
      return
    }
    setStage("queued")
    setFailure(null)
    const result = await createObjectiveAction({ workspace_id: workspaceId, template_key: selected.key, location_id: locationId, objective: objective.trim(), run: true })
    if (!result.ok) {
      setStage("failed")
      setFailure(result.error)
      if (result.status === 403) toast.error(pc.yourRoleOrLocation)
      else if (result.status === 429) toast.error(copy[locale].workspace.offers.errors.rate)
      return
    }
    // A 201 only means the action row exists. The run's own outcome comes back
    // in the same response, so report what actually happened rather than
    // promising a draft that may already have failed or be waiting on input.
    const { actionId, versionId, state, factsNeeded, runError } = result.data
    if (runError === "ai_budget_reached") {
      // P3.5a: the action exists; only the draft was refused, before any model call.
      toast.error(t(locale, "budget.aiLimit"))
    } else if (runError === "ai_paused") {
      // P3.5d: the action exists; AI drafting is paused for maintenance.
      toast.error(t(locale, "pause.ai"))
    } else if (runError === "run_in_progress") {
      // F-14: the same objective was submitted twice; the first draft is still being written.
      toast.message(pc.actionCreatedRunInProgress)
    } else if (runError) {
      toast.error(pc.actionCreatedButThe)
    } else if (factsNeeded?.length) {
      toast.message(pc.actionCreatedAFew)
    } else if (state === "failed") {
      toast.error(pc.draftFailedRetry)
    } else if (versionId) {
      toast.success(pc.actionCreatedAndThe)
    } else {
      toast.success(pc.actionCreated)
    }
    router.push(withLocation(`${base}/actions/${actionId}`, location))
  }

  /**
   * One card renderer for every group, so the lead group and the rest can never
   * drift into showing different facts about the same template. The capability
   * badge comes from the template registry, which is the same source
   * lib/capabilities.ts is tested against — four of these are Beta.
   */
  function goalCard(goal: (typeof GOALS)[number]) {
    const Icon = ICONS[goal.key]
    const open = openByTemplate.get(goal.key)
    return (
      <button key={goal.key} type="button" className={selectedKey === goal.key ? "goal-card is-selected" : "goal-card"} aria-pressed={selectedKey === goal.key} onClick={() => { setSelectedKey(goal.key); setStage("idle") }}>
        <span><Icon /></span>
        <div>
          <Badge variant="outline">{open?.factType==='Observed' ? pc.evidenceLed : open?.factType==='Recommended' || !open ? pc.ownerObjective : pc.sourceUnconfirmed}</Badge>
          <CapabilityBadge value={goal.capability} />
          <h2>{labels[goal.key].title}</h2>
          <p>{open ? open.evidence : labels[goal.key].summary}</p>
          <small>{fill(pc.toReview, { effortMinutes: effortLabel(goal.effortMinutes, locale) })}</small>
        </div>
        <ChevronRight />
      </button>
    )
  }

  return (
    <div className="create-page">
      <PageIntro
        eyebrow={pc.outcomeLedCreationCentre}
        title={pc.whatDoYouWant}
        description={pc.chooseABusinessOutcome}
        actions={<><ContextualAssistant locale={locale} surface="create" mode="live" context={{ workspaceId, locationId: locationId ?? undefined }} basePath={base} locationParam={location} /><LocationSelect locale={locale} value={location} locations={locations} className="location-select" /><Button asChild variant="outline"><Link href={withLocation(`${base}/actions`, location)}>{pc.openActionQueue}<ArrowRight /></Link></Button></>}
      />
      {!canCreate && <RoleNotice kind="createReadOnly" locale={locale} />}
      <Tabs value={tab} onValueChange={setTab} className="create-tabs">
        <TabsList variant="line"><TabsTrigger value="recommended">{pc.recommendedFromEvidence} <span>{recommended.length}</span></TabsTrigger><TabsTrigger value="all">{pc.allOutcomes}</TabsTrigger></TabsList>
        <TabsContent value={tab}>
          {tab === "recommended" ? (
            recommended.length === 0 ? <div className="empty-state"><span><CheckCircle2 /></span><h2>{pc.noEvidenceLedGoals}</h2><p>{pc.youCanStillStart}</p></div> : (
              <div className="goal-card-grid">{recommended.map(goalCard)}</div>
            )
          ) : (
            <>
              <p className="eyebrow">{pc.recommendedStartingPoints}</p>
              <div className="goal-card-grid">{LEAD_GOALS.map(goalCard)}</div>
              <p className="eyebrow">{pc.otherCapabilities}</p>
              <div className="goal-card-grid">{SECONDARY_GOALS.map(goalCard)}</div>
            </>
          )}
        </TabsContent>
      </Tabs>
      <div className="create-review-layout">
        <SectionCard>
          <p className="eyebrow">{existing ? pc.whyThisIsSuggested : pc.ownerObjective}</p><h2>{labels[selected.key].title}</h2>
          <div className="fact-stack">{existing ? <div><FactType type={existing.factType ?? "Unknown"} /><p>{existing.source ? `${existing.source} · ` : ""}{existing.evidence}{existing.freshness ? ` · ${existing.freshness}` : ""}</p></div> : <div><FactType type="Unknown" /><p>{pc.noMeasuredEvidenceBacks}</p></div>}<div><FactType type="Recommended" /><p>{labels[selected.key].summary}</p></div></div>
          <div className="field-stack"><Label htmlFor="objective">{pc.objectiveLabel}</Label><Textarea id="objective" rows={4} value={objective} onChange={(event) => setObjective(event.target.value)} placeholder={pc.forExamplePromoteThis} disabled={!canCreate || stage === "queued"} /><small>{pc.theObjectiveIsRecorded}</small></div>
          <div className="required-inputs"><strong>{pc.requiredBeforeStarting}</strong>{selected.requiredInputs.length === 0 ? <span><CheckCircle2 /> {pc.noExtraInputsNeeded}</span> : selected.requiredInputs.map((key) => <span key={key}><AlertTriangle /> {inputs[key] ?? key}</span>)}<span><CheckCircle2 /> {pc.ownerStillConfirmsFactual}</span></div>
          {existing && <p className="limitation-note"><Sparkles /> {pc.anOpenActionOf} <Link href={withLocation(`${base}/actions/${existing.id}`, location)}>{pc.openTheExistingAction}</Link></p>}
        </SectionCard>
        <SectionCard className="usage-before-generation">
          <p className="eyebrow">{pc.usageAndDelivery}</p><h2>{pc.generationAndRevisionUse}</h2>
          <p>{pc.oneApprovedDeliveryIs}</p>
          {stage === "idle" && <Button className="w-full" onClick={() => void startDraft()} disabled={!canCreate}><WandSparkles /> {pc.createTheActionAnd}</Button>}
          {stage === "queued" && <div className="run-state-box run-running" role="status"><LoaderCircle className="animate-spin" /><div><strong>{pc.creatingTheActionAnd}</strong><span>{pc.validatingSourceEvidenceGuardrails}</span></div></div>}
          {stage === "failed" && <div className="run-state-box run-failed" role="alert"><XCircle /><div><strong>{pc.theActionCouldNot}</strong><span>{pc.existingWorkIsPreserved}{failure ? ` · ${failure}` : ""}</span></div><Button variant="outline" onClick={() => void startDraft()}>{copy[locale].workspace.packs.retry}</Button></div>}
          <small>{fill(pc.scope, { scope: location === "all" ? pc.scopeAll : locations.find((l) => l.slug === location)?.name ?? location })}{existing ? ` · ${pc.scopeEvidenceLed}` : ""}</small>
        </SectionCard>
      </div>
    </div>
  )
}
