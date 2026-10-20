"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState, useSyncExternalStore } from "react"
import {
  AlertTriangle, ArrowLeft, BadgeCheck, Check, CheckCircle2, CircleAlert, Clock3, CloudOff, Copy, Download, FileClock, FileImage,
  History, LoaderCircle, MapPin, MessageSquare, PencilLine, RefreshCw, Save, Send, ShieldAlert, ShieldCheck, Tag, UserRound, WandSparkles, X,
} from "lucide-react"
import { toast } from "sonner"

import { RoleNotice } from "@/components/states/role-notice"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ContextualAssistant } from "@/components/pocket-assistant/assistant-launcher"
import { GbpPublishCard } from "@/components/workspace/gbp-publish-card"
import type { DemoAssistantRunResponse } from "@/lib/pocket-assistant/contracts"
import { CapabilityBadge, FactType, SectionCard } from "@/components/product-ui"
import { copy, homeReviewCopy, type PrototypeLocale } from "@/lib/copy"
import { googleBusinessPublishCapability } from "@/lib/capabilities"
import type { PublishPanel } from "@/lib/publishing/page-state"
import { resolveText } from "@/lib/domain"
import { copyToClipboard, downloadText } from "@/lib/download"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import { auditActorLabel, auditEventLabel } from "@/lib/workspace/audit-labels"
import { approveVersion, decideVersion, exportVersion, markApplied as markAppliedRequest, retractApplied as retractAppliedRequest, runAction, saveAssistantVersion, saveVersion, updateAction, type ClientResult } from "@/lib/workspace/client"
import { t } from "@/lib/i18n"
import { fill } from "@/lib/copy-ui"
import { aiBudgetRefusal } from "@/lib/budgets/messages"
import { runErrorLabel } from "@/lib/assistant/draft-failure"
import { formatOfferDate, isOfferStaleCode, offerStaleKind, type OfferStaleKind } from "@/lib/workspace/offer-format"
import { buildExportText, effortLabel, formatDateTime, priorityClass, priorityLabel, stateLabel, withLocation } from "@/lib/workspace/format"
import type { ActionDetail, AuditEventRow, VersionRow } from "@/lib/workspace/queries-pages"
import { EvidenceTab } from "@/components/workspace/action-detail/evidence-tab"
import { WorkflowTab } from "@/components/workspace/action-detail/workflow-tab"
import { clientHydrated, originLabel, ownerInputPatch, serverHydrated, subscribeHydration, subscribeOnline } from "@/components/workspace/action-detail/helpers"
import { guardrailText } from "@/lib/workspace/guardrail-text"
import { sourceLabel } from "@/lib/workspace/source-label"
import { actionVerificationView } from "@/lib/workspace/action-verification"
import { OwnerReviewCheckPanel } from "@/components/workspace/owner-review-check-panel"
import { EMPTY_OWNER_CHECK, ownerCheckNextStep, type OwnerCheckContext } from "@/lib/workspace/owner-review-check"

export interface ActionDetailClientProps {
  locale: PrototypeLocale
  workspaceSlug: string
  workspaceId: string
  timezone: string
  role: WorkspaceRole
  inScope: boolean
  location: string
  detail: ActionDetail
  auditRows: AuditEventRow[]
  locations: Array<{ slug: string; name: string }>
  /** Approved image assets, offered when a social post needs an asset or explicit text-only (§3.7). */
  approvedAssets: Array<{ id: string; filename: string }>
  /**
   * P4.1: the confirmed offer an offer-promotion action is written from, with the
   * price already formatted by the server. Absent for every other action.
   */
  offer?: OfferCardData | null
  /** The revision the latest version recorded (version meta `offer_revision`); null when none was recorded. */
  latestVersionOfferRevision?: number | null
  /** Show the link to the Offers page (the page 404s while the flag is off). */
  offersEnabled?: boolean
  /** The exact version a `?version=` link names. An unavailable version fails closed. */
  initialVersionId?: string | null
  /** P4.6: the Google publish card's data (review-response only); null hides it. The server stays the authority. */
  publishPanel?: PublishPanel | null
  ownerCheck?: OwnerCheckContext
  ownerCheckIdentity?: string
  /** Shown in the Actions side panel, under the queue's own h1: the title becomes an h2. */
  embedded?: boolean
}

export interface OfferCardData {
  title: string
  priceText: string | null
  validFrom: string
  validUntil: string
  revision: number
  status: "draft" | "confirmed" | "archived"
  expired: boolean
}


type Busy = null | "run" | "save" | "approve" | "decide" | "export" | "copy" | "inputs" | "applied"
type PreviewRole = "owner" | "manager" | "viewer"

export { ownerInputPatch } from "@/components/workspace/action-detail/helpers"

export function ActionDetailClient(props: ActionDetailClientProps) {
  return <VersionBoundActionDetail key={`${props.workspaceId}:${props.detail.action.id}`} {...props} />
}

function VersionBoundActionDetail(props: ActionDetailClientProps) {
  const router = useRouter()
  const invalid = props.initialVersionId != null && !props.detail.versions.some(version => version.id === props.initialVersionId)
  // Retain only this action/workspace's previously valid editor. An invalid
  // route must neither mount a fallback editor nor discard pending local input.
  const [lastValidProps, setLastValidProps] = useState<ActionDetailClientProps | null>(() => invalid ? null : props)
  if (!invalid && lastValidProps !== props) setLastValidProps(props)
  const editorProps = invalid ? lastValidProps : props
  const text = homeReviewCopy[props.locale]
  const restoreHref = editorProps ? withLocation(
    `/${editorProps.locale}/owner/${editorProps.workspaceSlug}/actions/${editorProps.detail.action.id}${editorProps.initialVersionId != null ? `?version=${encodeURIComponent(editorProps.initialVersionId)}` : ""}`,
    editorProps.location,
  ) : null
  return <>
    {invalid && <section className="section-card" data-testid="invalid-action-version" role="alert">
      <h1>{text.missingVersion}</h1>
      <p>{text.missingVersionHelp}</p>
      {restoreHref
        ? <Button type="button" variant="outline" onClick={() => router.replace(restoreHref)}>{text.restoreVersion}</Button>
        : <Button asChild variant="outline"><Link href={withLocation(`/${props.locale}/owner/${props.workspaceSlug}`, props.location)}>{text.returnHome}</Link></Button>}
    </section>}
    {editorProps && <div hidden={invalid} inert={invalid} data-retained-action-editor>
      <ActionDetailEditor {...editorProps} />
    </div>}
  </>
}

function ActionDetailEditor({ locale, workspaceSlug, workspaceId, timezone, role, inScope, location, detail, auditRows, locations, approvedAssets, offer = null, latestVersionOfferRevision = null, offersEnabled = false, initialVersionId = null, publishPanel = null, ownerCheck = EMPTY_OWNER_CHECK, ownerCheckIdentity, embedded = false }: ActionDetailClientProps) {
  const ac = copy[locale].action
  const router = useRouter()
  const base = `/${locale}/owner/${workspaceSlug}`
  const { action, versions, runs, measurements, scanInputs, businessContext, faqQuestions } = detail
  // The reviews the draft will actually use, resolved from the same stored
  // evidence the agent reads. When this is set the owner is shown the reviews
  // rather than a blank textarea asking them to retype what was collected.
  const reviewEvidence = scanInputs.find((entry) => entry.key === "reviews_without_response") ?? null
  const scanInputCopy = copy[locale].workspace.scanInputs
  const inputs = copy[locale].workspace.inputs
  // P2.3 item 11: replaces the generic "Owner fact N" label with the actual
  // customer question this fact answers, and prefills a brand fact already on
  // file so the owner is not asked to retype it.
  const faqQuestionByKey = new Map<string, (typeof faqQuestions)[number]>(faqQuestions.map((q) => [q.key, q]))
  const social = action.templateKey === "social-post"
  /**
   * P2.1 item 6 / P2.2 item 12. `gbp-profile-fix` and `ig-highlights` have no
   * agent, so every control that led to runAction() returned 409
   * agent_unavailable -- these two templates had no completion path at all.
   * The owner does the work in the other product and records it here.
   */
  const checklistCopy = copy[locale].workspace.checklist
  const checklistSteps = action.delivery === "checklist" ? copy[locale].workspace.checklistSteps[action.templateKey] ?? null : null
  /** Only these two delivery modes have an agent behind them. `null` (a row naming a template this build dropped) fails closed. */
  const agentBacked = action.delivery === "export" || action.delivery === "export_copy"
  /**
   * A live owner assertion that this action is out in the world. It is not
   * `actionState === "completed"`: completion is the consequence the assertion
   * route writes, and reading it back as the control's state would light the
   * button up for a `completed` row that carries no assertion at all.
   */
  const applied = action.applied
  const appliedOn = formatDateTime(action.appliedOn, locale, timezone, "date")
  const verified = action.verified
  const verifiedOn = formatDateTime(action.verifiedOn, locale, timezone, "date")
  const hydrated = useSyncExternalStore(subscribeHydration, clientHydrated, serverHydrated)
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
  const offline = !online

  const [previewRole, setPreviewRole] = useState<PreviewRole>("owner")
  const effectiveRole: PreviewRole = role === "owner" ? previewRole : role
  // A `?version=` link lands on that version; the render-time re-selection below only runs when the
  // version list changes, so it never undoes this initial choice.
  const [initialVersion] = useState(() => versions.find((v) => v.id === initialVersionId) ?? versions[0])
  const [versionId, setVersionId] = useState<string | null>(initialVersion?.id ?? null)
  const [content, setContent] = useState(initialVersion?.body ?? "")
  const [altText, setAltText] = useState(initialVersion?.alt_text ?? "")
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState<Busy>(null)
  const mutationPending = useRef(false)
  const [conflict, setConflict] = useState(false)
  const [comparing, setComparing] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [allowanceBlocked, setAllowanceBlocked] = useState<{ approvedDeliveries: number | null; allowance: number | null } | null>(null)
  const [factsNeeded, setFactsNeeded] = useState<string[] | null>(null)
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [lastRunError, setLastRunError] = useState<string | null>(null)
  const [localRunReconciliation, setNeedsRunReconciliation] = useState(false)
  // A 409 from approve/export names the reason the moment it happens; the derived reason below catches it on load.
  const [offerRefusal, setOfferRefusal] = useState<OfferStaleKind | null>(null)
  const [pendingSelect, setPendingSelect] = useState<string | null>(null)
  // Seeded from the server-resolved effective selection, so the boxes always
  // match what the next draft will actually use.
  const [selectedReviews, setSelectedReviews] = useState<string[]>(reviewEvidence?.selected ?? [])

  // Versions arrive from the server; after router.refresh() re-point the editor
  // at the version we just created, or at the newest one if the selected one
  // vanished. Done during render (React's "adjust state on prop change"), so
  // unsaved local text survives an unrelated refresh.
  const versionsKey = versions.map((v) => v.id).join(",")
  const [seenVersionsKey, setSeenVersionsKey] = useState(versionsKey)
  // A refresh can arrive before the mutation response supplies pendingSelect.
  // Reconcile that response against an already-present row as well.
  const pendingVersion = versions.find((v) => v.id === pendingSelect)
  if (seenVersionsKey !== versionsKey || pendingVersion) {
    setSeenVersionsKey(versionsKey)
    const target = pendingVersion?.id ?? (versions.some((v) => v.id === versionId) ? null : versions[0]?.id ?? null)
    if (target) {
      const next = versions.find((v) => v.id === target)!
      setVersionId(next.id)
      setContent(next.body)
      setAltText(next.alt_text ?? "")
      setPendingSelect(null)
      if (pendingVersion) {
        setConflict(false)
        setComparing(false)
        setSaveFailed(false)
      }
    }
  }

  // Computed before the render-phase resync blocks below: the `?version=`
  // link calls `selectVersion`, whose unsaved-changes refusal reads `dirty`.
  // Reading it after those blocks threw "Cannot access 'dirty' before
  // initialization" when `?version=` changed on the mounted page.
  const selectedVersion: VersionRow | null = versions.find((item) => item.id === versionId) ?? null
  const dirty = selectedVersion ? content !== selectedVersion.body || altText !== (selectedVersion.alt_text ?? "") : content.trim().length > 0

  // A "Continue here" link to another version of this same action only changes `?version=`; the App
  // Router keeps this component mounted, so the prop changing is the signal. Same path as a manual
  // version pick (selectVersion); an id that is not among the versions changes nothing.
  const [seenInitialVersionId, setSeenInitialVersionId] = useState(initialVersionId)
  if (seenInitialVersionId !== initialVersionId) {
    setSeenInitialVersionId(initialVersionId)
    if (initialVersionId) selectVersion(initialVersionId)
  }

  // A refusal read off a 409 describes the offer and drafts as they were when it happened. Once either
  // changes (a new draft, or the offer edited, confirmed, extended or archived) it is out of date, and
  // the derived reason takes over.
  const offerKey = `${versionsKey}|${offer ? `${offer.revision}|${offer.status}|${offer.expired}` : ""}`
  const [seenOfferKey, setSeenOfferKey] = useState(offerKey)
  if (seenOfferKey !== offerKey) {
    setSeenOfferKey(offerKey)
    if (offerRefusal) setOfferRefusal(null)
  }

  const guardrailFlags = selectedVersion?.guardrails ?? []
  // "Not checked" and "checked, clean" are different facts and must not share
  // a badge.
  const guardrailBadge = guardrailFlags.length > 0
    ? fill(ac.guardrailBadge.flagged, { n: guardrailFlags.length })
    : selectedVersion?.checked
      ? ac.guardrailBadge.checked
      : ac.guardrailBadge.notChecked
  const offersCopy = copy[locale].workspace.offers
  // Judged against the selected version's recorded revision: approve and export act on that row,
  // and the server checks that row's revision (an older approved version can be stale while the latest is not).
  const offerStale: OfferStaleKind | null = offerRefusal ?? (offer ? offerStaleKind(offer, { hasVersion: versions.length > 0, recordedRevision: selectedVersion ? selectedVersion.offerRevision : latestVersionOfferRevision }) : null)
  const approval = selectedVersion?.approval_state ?? null
  const delivery = selectedVersion?.delivery_state ?? "not_requested"
  // P4.6: delivery_state can read publishing/published/cancelled now, and an
  // export of a published version keeps 'published', so "was it exported" is
  // first_exported_at (the 'exported' state stays a fallback for older rows).
  const exported = Boolean(selectedVersion?.first_exported_at) || selectedVersion?.delivery_state === "exported"
  const saveBeforeGenerationMessage = t(locale, "editor.saveBeforeGeneration")
  const versionLabel = (no: number) => fill(ac.versionLabel, { n: no })
  const versionName = selectedVersion ? versionLabel(selectedVersion.version_no) : ac.noVersion
  const approvalText = (state: VersionRow["approval_state"] | null) => (state ? stateLabel(state, locale) : ac.noVersion)
  const canAssert = inScope && effectiveRole !== "viewer"
  const canEdit = hydrated && !offline && inScope && effectiveRole !== "viewer" && busy === null && pendingSelect === null
  const canApprove = canEdit && selectedVersion !== null
  const isApprovedCurrent = approval === "approved" && !dirty
  // While the stale-offer banner shows, the server refuses approve and export; the controls say so too.
  const canApproveCurrent = canApprove && !dirty && !conflict && selectedVersion?.id === versions[0]?.id && approval !== "rejected" && approval !== "superseded" && approval !== "approved" && offerStale === null
  const canDeliver = isApprovedCurrent && canApprove && offerStale === null
  const latestRun = runs[0]
  const needsRunReconciliation = localRunReconciliation || Boolean(latestRun?.usage_pending)
  const runStateKey = latestRun?.state
  // R3: the offer is bound by the action's offer_id column, so the owner is never asked for it.
  const neededKeys = (factsNeeded ?? (action.actionState === "needs_input" ? action.missingInputs : [])).filter((key) => key !== "offer_id")
  const showInputForm = neededKeys.length > 0 && effectiveRole !== "viewer" && inScope
  const canGenerate = canEdit && !dirty && !needsRunReconciliation && agentBacked && action.capability !== "Requires connection" && runStateKey !== "running" && runStateKey !== "queued"
  const relatedAudit = auditRows.slice(0, 12)

  const provenance = [
    { label: ac.provenance.scanEvidence, state: "complete", detail: `${sourceLabel(action.evidence.source, locale)} · ${formatDateTime(action.evidence.observedAt, locale, timezone)}` },
    { label: ac.provenance.finding, state: "complete", detail: resolveText(action.evidence.detail, locale) },
    { label: ac.provenance.action, state: "complete", detail: ac.provenance.priorityRecorded },
    {
      label: ac.provenance.agentInput,
      state: neededKeys.length ? "pending" : "complete",
      detail: neededKeys.length
        ? fill(ac.provenance.inputsMissing, { n: neededKeys.length })
        : reviewEvidence
          // Name the source, so "ready" is never mistaken for "the owner typed it".
          ? `${scanInputCopy.fromScan} · ${reviewEvidence.available}`
          : ac.provenance.inputsReady,
    },
    { label: ac.provenance.run, state: runStateKey === "succeeded" ? "complete" : latestRun ? "active" : "pending", detail: latestRun ? stateLabel(latestRun.state, locale) : ac.provenance.notRun },
    { label: ac.provenance.outputVersion, state: selectedVersion ? "active" : "pending", detail: versionName },
    { label: ac.provenance.approval, state: isApprovedCurrent ? "complete" : "pending", detail: dirty ? ac.provenance.unsaved : approvalText(approval) },
    { label: ac.provenance.export, state: exported ? "complete" : "pending", detail: exported ? ac.provenance.exportRecorded : ac.provenance.exportAfterApproval },
    { label: ac.provenance.measurement, state: action.measurementState === "measured" ? "complete" : "pending", detail: stateLabel(action.measurementState, locale) },
  ] as const

  function selectVersion(nextId: string) {
    const next = versions.find((item) => item.id === nextId)
    if (!next || next.id === versionId) return
    if (dirty) {
      toast.error(t(locale, "editor.saveManualEditsBeforeVersionChange"))
      return
    }
    setVersionId(next.id)
    setContent(next.body)
    setAltText(next.alt_text ?? "")
    setConflict(false)
  }

  function failureToast<T>(result: Extract<ClientResult<T>, { ok: false }>) {
    // P3.5a: named before the generic 429, which means "too many requests".
    const budgetRefusal = aiBudgetRefusal(locale, result.status, result.error)
    // P4.1: approve/export refuse a draft whose offer changed, ended or was archived. Plain copy, never the code.
    if (result.status === 409 && isOfferStaleCode(result.error)) { setOfferRefusal(result.error); toast.error(offersCopy.stale[result.error]) }
    // F-14: a second click while the first draft is still being written. Nothing was charged; show the live run.
    else if (result.status === 409 && result.error === "run_in_progress") {
      toast.message(ac.toasts.runInProgress)
      router.refresh()
    }
    else if (result.status === 409 && result.error === "provider_usage_pending") {
      setNeedsRunReconciliation(true)
      toast.message(ac.toasts.usagePending)
    }
    else if (result.error === "offline" || result.error === "network") toast.error(ac.toasts.unreachable)
    else if (budgetRefusal) toast.error(budgetRefusal)
    else if (result.status === 403) toast.error(ac.toasts.forbidden)
    else if (result.status === 429) toast.error(ac.toasts.tooMany)
    else if (result.error === "agent_unavailable") toast.error(ac.toasts.agentUnavailable)
    // 503 before any run row exists: say the drafting service is down, not "try again".
    else if (result.error === "provider_unconfigured") toast.error(runErrorLabel(locale, result.error))
    // P3.5b: never a raw error code in front of an owner.
    else toast.error(ac.toasts.failed)
  }

  async function generate(extraInputs?: Record<string, unknown>) {
    if (dirty) { toast.error(saveBeforeGenerationMessage); return }
    if (mutationPending.current || needsRunReconciliation || (!canGenerate && !extraInputs)) return
    mutationPending.current = true
    setBusy("run")
    setLastRunError(null)
    const result = await runAction(action.id, extraInputs ? { inputs: extraInputs } : {})
    mutationPending.current = false
    setBusy(null)
    if (!result.ok) {
      // A lost response can follow a completed run. Read the server's current
      // draft/run first rather than spending another model request blindly.
      if (result.error === "network" || result.status >= 500) setNeedsRunReconciliation(true)
      return failureToast(result)
    }
    if (result.data.factsNeeded?.length) {
      setFactsNeeded(result.data.factsNeeded)
      toast.message(ac.toasts.factsNeeded)
      router.refresh()
      return
    }
    // This settled run did not request facts. Previously fulfilled requests
    // must not keep the input form open or disable a safe explicit retry.
    setFactsNeeded(null)
    if (result.data.state === "failed") {
      if (result.data.usagePending) setNeedsRunReconciliation(true)
      setLastRunError(result.data.error ?? "failed")
      toast.error(result.data.usagePending
        ? ac.toasts.runUnconfirmed
        : ac.toasts.runFailed)
      router.refresh()
      return
    }
    if (result.data.versionId) setPendingSelect(result.data.versionId)
    toast.success(result.data.versionNo ? fill(ac.toasts.versionCreated, { n: result.data.versionNo }) : ac.toasts.runCompleted)
    router.refresh()
  }

  async function submitInputs() {
    if (dirty && !checklistSteps) { toast.error(saveBeforeGenerationMessage); return }
    if (!canEdit) return
    const { provided, runInputs } = ownerInputPatch(neededKeys, inputValues)
    const missing = neededKeys.filter((key) => provided[key] === undefined)
    if (missing.length) {
      toast.error(ac.toasts.fillAll)
      return
    }
    setBusy("inputs")
    const patched = await updateAction(action.id, { provided_inputs: provided })
    setBusy(null)
    if (!patched.ok) return failureToast(patched)
    // A checklist template has no agent to hand these to. Calling generate()
    // here is exactly what made the input form dead-end on 409.
    if (checklistSteps) {
      toast.success(ac.toasts.checklistSaved)
      router.refresh()
      return
    }
    toast.message(ac.toasts.inputsRecorded)
    await generate({ ...provided, ...runInputs })
  }

  /**
   * The owner's assertion that this action is live in the world. This is a
   * self-report and the product says so: nothing here verifies it, and the
   * next comparable scan is what observes the result. It consumes no delivery
   * allowance and creates no version.
   *
   * It replaces the old checklist-only `markChecklistDone`, which patched
   * action_state='completed' directly. That state is now a consequence of the
   * assertion, set by the route in the same transaction, so there is exactly
   * one owner control and one record of what was claimed. The control is
   * offered for drafted actions too, where it carries the approved version the
   * owner published -- an unapproved draft is never sent, because the route
   * rejects it with 409 version_not_applicable.
   */
  async function markApplied() {
    if (!canEdit || applied) return
    setBusy("applied")
    // `versions` is ordered newest-first (v.version_no DESC), so the first
    // approved entry is the latest approved version -- not necessarily
    // action.latestVersion, which is whatever version is newest overall and
    // may be a later unapproved draft. Asserting about that draft would send
    // a version nobody approved, which the route already refuses (409
    // version_not_applicable); this picks the one that is actually eligible.
    const latestApproved = versions.find((v) => v.approval_state === "approved")?.id ?? null
    const result = await markAppliedRequest(action.id, latestApproved ? { output_version_id: latestApproved } : {})
    setBusy(null)
    if (!result.ok) return failureToast(result)
    toast.success(t(locale, "applied.markedToast"))
    router.refresh()
  }

  async function retractApplied() {
    if (!canEdit || !applied) return
    setBusy("applied")
    const result = await retractAppliedRequest(action.id)
    setBusy(null)
    if (!result.ok) return failureToast(result)
    toast.success(t(locale, "applied.retractedToast"))
    router.refresh()
  }

  /**
   * The optional owner addition next to the scanned reviews. Deliberately not
   * submitInputs(): that one is all-or-nothing over every missing key, and here
   * nothing is missing -- this is one extra review the scan did not capture.
   */
  /**
   * P2.2 "selected-review replies". Only keys travel: the server rebuilds the
   * review text from stored evidence and re-applies the same filter, so this
   * can narrow what the agent receives but never introduce anything.
   *
   * The last selected review cannot be unchecked. An empty selection means
   * "all of them" to the server -- correct as a fallback for a stale stored
   * choice, but as a deliberate act it would silently do the opposite of what
   * the empty checkboxes appear to say.
   */
  async function toggleReview(key: string, include: boolean) {
    if (!canEdit || !reviewEvidence) return
    const next = include ? [...selectedReviews, key] : selectedReviews.filter((k) => k !== key)
    if (next.length === 0) { toast.error(scanInputCopy.keepOne); return }
    const previous = selectedReviews
    setSelectedReviews(next)
    setBusy("inputs")
    const patched = await updateAction(action.id, { provided_inputs: { selected_reviews: next } })
    setBusy(null)
    if (!patched.ok) { setSelectedReviews(previous); return failureToast(patched) }
  }

  async function addOwnerReviewNote() {
    if (dirty) { toast.error(saveBeforeGenerationMessage); return }
    if (!canEdit) return
    const value = (inputValues.reviews_without_response ?? "").trim()
    if (!value) return
    setBusy("inputs")
    const patched = await updateAction(action.id, { provided_inputs: { reviews_without_response: value } })
    setBusy(null)
    if (!patched.ok) return failureToast(patched)
    toast.message(ac.toasts.ownerReviewRecorded)
    await generate({ reviews_without_response: value })
  }

  async function saveDraft() {
    if (!canEdit || mutationPending.current) return
    if (conflict) { toast.error(ac.toasts.conflict); return }
    if (!dirty) { toast.message(ac.toasts.nothingToSave); return }
    if (!content.trim()) { toast.error(ac.toasts.emptyVersion); return }
    mutationPending.current = true
    setBusy("save")
    setSaveFailed(false)
    const result = await saveVersion(action.id, { body: content, alt_text: altText || undefined, base_version_id: selectedVersion?.id ?? null })
    mutationPending.current = false
    setBusy(null)
    if (!result.ok) {
      setSaveFailed(true)
      if (result.status === 409 && result.error === "version_conflict") { setConflict(true); return }
      return failureToast(result)
    }
    setPendingSelect(result.data.versionId)
    toast.success(fill(ac.toasts.savedAs, { n: result.data.versionNo }))
    router.refresh()
  }

  /**
   * "Create a new version" from the Visibility Operator (§3.8): the assistant
   * never writes; the artifact body goes through the same versions route as a
   * manual save, based on the selected version, then the server tree refreshes.
   */
  async function createAssistantVersion(run: DemoAssistantRunResponse) {
    if (dirty) { toast.error(saveBeforeGenerationMessage); return { ok: false as const } }
    if (!canEdit || mutationPending.current) {
      toast.error(ac.toasts.cannotCreateVersion)
      return { ok: false as const }
    }
    // Only the run id travels. The body is read from the run the server
    // persisted, so the version is recorded as agent-authored rather than
    // arriving here as text this component would have posted as the member's.
    if (!run.draftRunId) { toast.error(ac.toasts.draftNotSaved); return { ok: false as const } }
    mutationPending.current = true
    setBusy("save")
    setSaveFailed(false)
    const result = await saveAssistantVersion(action.id, { assistant_run_id: run.draftRunId, base_version_id: selectedVersion?.id ?? null })
    mutationPending.current = false
    setBusy(null)
    if (!result.ok) {
      setSaveFailed(true)
      if (result.status === 409 && result.error === "version_conflict") setConflict(true)
      else failureToast(result)
      return { ok: false as const }
    }
    setPendingSelect(result.data.versionId)
    toast.success(fill(ac.toasts.savedAs, { n: result.data.versionNo }))
    router.refresh()
    return { ok: true as const, versionNo: result.data.versionNo }
  }

  function loadLatest() {
    setComparing(true)
    router.refresh()
  }

  function resolveConflict(keepEdits: boolean) {
    const latest = versions[0]
    if (!latest || latest.id === versionId) return
    setVersionId(latest.id)
    if (!keepEdits) {
      setContent(latest.body)
      setAltText(latest.alt_text ?? "")
    }
    setConflict(false)
    setComparing(false)
    setSaveFailed(false)
  }

  async function approveDraft() {
    if (mutationPending.current) return
    if (!canApproveCurrent || !selectedVersion) { toast.error(ac.toasts.saveBeforeApprove); return }
    mutationPending.current = true
    setBusy("approve")
    const result = await approveVersion(selectedVersion.id, comment.trim() || undefined)
    mutationPending.current = false
    setBusy(null)
    if (!result.ok) {
      if (result.error === "version_closed") toast.error(ac.toasts.versionClosed)
      else failureToast(result)
      return
    }
    toast.success(result.data.idempotent ? fill(ac.toasts.alreadyApproved, { version: versionName }) : fill(ac.toasts.approved, { version: versionName }))
    setComment("")
    router.refresh()
  }

  async function setDecision(decision: "changes_requested" | "rejected") {
    if (!canApprove || dirty || !selectedVersion) return
    setBusy("decide")
    const result = await decideVersion(selectedVersion.id, decision, comment.trim() || undefined)
    setBusy(null)
    if (!result.ok) return failureToast(result)
    toast.message(decision === "changes_requested" ? ac.toasts.changesRequested : ac.toasts.rejected)
    setComment("")
    router.refresh()
  }

  async function deliver(mode: "export" | "copy") {
    if (mutationPending.current) return
    if (!canDeliver || !selectedVersion) { toast.error(ac.toasts.onlyApproved); return }
    mutationPending.current = true
    setBusy(mode)
    const result = await exportVersion(selectedVersion.id, mode)
    mutationPending.current = false
    setBusy(null)
    if (!result.ok) {
      if (result.error === "allowance_exceeded") { setAllowanceBlocked({ approvedDeliveries: null, allowance: null }); return }
      if (result.error === "not_approved") toast.error(ac.toasts.notApproved)
      else failureToast(result)
      return
    }
    setAllowanceBlocked(null)
    // P2.2/item 13: the FAQ and website-basics exports must carry implementation
    // instructions and an explicit "not applied" statement -- exporting a draft
    // is not a claim the website changed. buildExportText appends them (from
    // the agent's own acceptance_criteria, already persisted, never read back
    // before this) only for the two templates that need them.
    if (mode === "export") {
      const text = buildExportText({
        body: selectedVersion.body,
        altText: selectedVersion.alt_text,
        templateKey: action.templateKey,
        acceptanceCriteria: selectedVersion.acceptanceCriteria,
        locale,
      })
      downloadText(`${action.templateKey}-v${selectedVersion.version_no}.md`, text, "text/markdown;charset=utf-8")
    } else {
      const copied = await copyToClipboard(selectedVersion.body)
      if (!copied) {
        toast.error(ac.toasts.clipboard)
        // The delivery is recorded either way. A first copy still says usage went
        // up; a repeat must not then claim "Approved text copied" over the error.
        if (!result.data.counted) { router.refresh(); return }
      }
    }
    toast.success(result.data.counted ? ac.toasts.counted : (mode === "copy" ? ac.toasts.copiedAgain : ac.toasts.exportedAgain))
    router.refresh()
  }

  const roleName = (r: PreviewRole) => ac.roles[r]
  const workflowState = runStateKey ?? null
  const workflowLabel = workflowState ? stateLabel(workflowState, locale) : ac.provenance.notRun
  const locationName = resolveText(action.location.name, locale) || locations.find((l) => l.slug === location)?.name || ""
  const verificationCopy = copy[locale].workspace.verification
  const verification = actionVerificationView(action, workspaceId, auditRows)
  const currentOwnerCheck = ownerCheck.records.find(row => row.versionId === selectedVersion?.id)
  const ownerNext = action.templateKey === "review-response" && selectedVersion && !ownerCheck.unavailable
    ? !ownerCheck.appliedVersionIds.includes(selectedVersion.id)
      ? resolveText(ownerCheckNextStep("not_applied"), locale)
      : currentOwnerCheck ? resolveText(ownerCheckNextStep(currentOwnerCheck.decision), locale) : null
    : null
  const verificationNext = action.verified ? verificationCopy.verifiedNext
    : ownerNext ?? (verification.unsupported ? verificationCopy.googleNext
    : verification.outcome === "source_unavailable" || verification.outcome === "not_verifiable"
      ? verificationCopy.retryNext : verificationCopy.scanNext)
  const showVerification = action.applied || action.verified ||
    versions.some((version) => version.first_exported_at) || verification.checkedAt !== null ||
    action.templateKey === "review-response" && ownerCheck.records.length > 0

  return (
    <div className="action-detail-page">
      <div className="action-detail-toolbar">
        {/* In the side panel, Close (which keeps the queue's filters) replaces this link. */}
        {!embedded && <Link href={withLocation(`${base}/actions`, location)} className="back-link"><ArrowLeft /> {ac.toolbar.back}</Link>}
        <div>
          {role === "owner" ? (
            <Select disabled={!hydrated} value={previewRole} onValueChange={(value) => setPreviewRole(value as PreviewRole)}>
              <SelectTrigger className="role-select" aria-label={ac.toolbar.previewRole}><UserRound /><SelectValue>{roleName(previewRole)}</SelectValue></SelectTrigger>
              <SelectContent align="end"><SelectItem value="owner">{ac.roleOptions.owner}</SelectItem><SelectItem value="manager">{ac.roleOptions.manager}</SelectItem><SelectItem value="viewer">{ac.roleOptions.viewer}</SelectItem></SelectContent>
            </Select>
          ) : <Badge variant="outline"><UserRound /> {roleName(role)}</Badge>}
          <span className="offline-toggle" aria-live="polite">{offline ? <CloudOff /> : <Check />}<span>{offline ? ac.toolbar.offline : ac.toolbar.online}</span></span>
        </div>
      </div>

      <header className="action-detail-header">
        <div>
          <div className="action-detail-badges"><Badge variant="outline" className={priorityClass(action.priority)}>{priorityLabel(action.priority, locale)}</Badge><Badge variant="outline">{dirty ? ac.header.unsaved : action.applied || action.verified ? resolveText(action.displayPhase, locale) : selectedVersion ? approvalText(approval) : resolveText(action.displayPhase, locale)}</Badge><CapabilityBadge value={action.capability} context="action" /></div>
          {embedded ? <h2>{resolveText(action.title, locale)}</h2> : <h1>{resolveText(action.title, locale)}</h1>}<p>{resolveText(action.summary, locale)}</p>
          <div className="header-meta"><span><MapPin />{locationName}</span><span><Clock3 />{effortLabel(action.effortMinutes, locale)}</span><span><UserRound />{action.assignee?.name ?? ac.header.unassigned}</span></div>
        </div>
        <div className="action-detail-next"><small>{ac.header.nextLabel}</small><strong>{effectiveRole === "viewer" ? ac.header.next.inspect : showInputForm ? ac.header.next.inputs : dirty ? ac.header.next.saveFirst : action.applied || action.verified ? verificationNext : isApprovedCurrent ? ac.header.next.export : selectedVersion ? fill(ac.header.next.review, { version: versionName }) : ac.header.next.generate}</strong><span>{ac.header.due}{action.dueAt ? formatDateTime(action.dueAt, locale, timezone) : "—"}</span></div>
      </header>

      {action.evidence.followUpOfActionId && <p className="action-follow-up"><Link href={withLocation(`${base}/actions/${action.evidence.followUpOfActionId}`, location)}>{verificationCopy.followUp}</Link></p>}
      {showVerification && <SectionCard className="action-verification-result">
        <div className="section-card-heading"><div><p className="eyebrow">{verificationCopy.heading}</p><h2>{verificationCopy.outcomes[verification.outcome]}</h2></div><FactType type={verification.outcome === "verified" ? "Observed" : "Unknown"} /></div>
        {verification.unsupported && <p>{verificationCopy.unsupportedReview}</p>}
        {verification.outcome !== "verified" && <p>{verificationCopy.unknown}</p>}
        <dl className="evidence-detail-dl">
          <div><dt>{verificationCopy.source}</dt><dd>{verification.sourceUrl ? <a className="break-all" href={verification.sourceUrl} target="_blank" rel="noopener noreferrer">{verification.sourceUrl}</a> : verificationCopy.noSource}</dd></div>
          <div><dt>{verificationCopy.checkedAt}</dt><dd>{verification.checkedAt ? formatDateTime(verification.checkedAt, locale, timezone) : verificationCopy.noCheck}</dd></div>
        </dl>
        <p>{verificationNext}</p><p>{verificationCopy.businessResults}</p>
        {action.templateKey === "review-response" && (applied || ownerCheck.records.length > 0) && selectedVersion && <OwnerReviewCheckPanel
          locale={locale} workspaceId={workspaceId} actionId={action.id} version={selectedVersion}
          latestVersionId={versions[0].id} identity={ownerCheckIdentity ?? locationName}
          timezone={timezone} mapsUrl={reviewEvidence?.mapsUrl ?? null} context={ownerCheck}
          approvedAssets={approvedAssets} canEdit={canEdit} offline={offline} dirty={dirty || conflict}
          onSaved={() => router.refresh()} onReload={() => router.refresh()}
          returnHomeHref={withLocation(base, location)}
        />}
      </SectionCard>}

      {offline && <div className="offline-banner" role="status"><CloudOff /><div><strong>{ac.offline.title}</strong><span>{ac.offline.body}</span></div><Button variant="outline" onClick={() => { if (navigator.onLine) router.refresh(); else toast.message(ac.toasts.stillOffline) }}>{ac.offline.reconnect}</Button></div>}
      {effectiveRole === "viewer" && <RoleNotice kind="viewerAction" locale={locale} />}
      {role === "manager" && !inScope && <RoleNotice kind="outOfScope" locale={locale} />}

      {offerStale && (
        <div className="permission-banner" role="alert" data-testid="offer-stale-banner">
          <AlertTriangle />
          <div><strong>{offersCopy.stale[offerStale]}</strong></div>
          {offersEnabled && <Link href={withLocation(`${base}/actions/new?mode=offer`, location)}>{offersCopy.card.viewOffers}</Link>}
        </div>
      )}

      <details className="owner-disclosure owner-workflow-disclosure">
        <summary>{copy[locale].ownerFocus.workflow}</summary>
      <ol className="provenance-chain" aria-label={ac.provenance.aria}>
        {provenance.map((item, index) => <li key={item.label} className={`is-${item.state}`}><span className="provenance-node">{item.state === "complete" ? <Check /> : index + 1}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div></li>)}
      </ol>
      </details>

      <Tabs defaultValue="draft" className="action-detail-tabs">
        <TabsList variant="line" className="detail-tab-list"><TabsTrigger value="draft">{ac.tabs.draft}</TabsTrigger><TabsTrigger value="evidence">{ac.tabs.evidence}</TabsTrigger><TabsTrigger value="workflow">{ac.tabs.workflow}</TabsTrigger><TabsTrigger value="history">{ac.tabs.history}</TabsTrigger></TabsList>

        <TabsContent value="draft">
          <div className="draft-layout">
            <SectionCard className="draft-editor-card">
              <div className="section-card-heading"><div><p className="eyebrow">{checklistSteps ? checklistSteps.where : ac.editor.generatedOutput}</p><h2>{copy[locale].workspace.templates[action.templateKey]?.workflow ?? action.templateKey}</h2></div><div><Badge variant="outline">{checklistSteps ? stateLabel(action.actionState, locale) : versionName}</Badge>{!checklistSteps && selectedVersion && <Badge variant="outline">{originLabel(selectedVersion.origin, locale !== "en")}</Badge>}</div></div>
              {social && approvedAssets.length > 0 && <div className="asset-reference"><span><FileImage /></span><div><strong>{approvedAssets[0].filename}</strong><small>{fill(ac.editor.approvedAsset, { n: approvedAssets.length })}</small></div><Badge variant="outline">{ac.editor.approved}</Badge></div>}
              <div className="original-context"><FactType type={action.evidence.factType} /><div><strong>{ac.editor.sourceFinding}</strong><p>{resolveText(action.evidence.detail, locale)}</p><small>{formatDateTime(action.evidence.observedAt, locale, timezone)} · {ac.editor.sourcePreserved}</small></div></div>
              {offer && (
                <div className="brand-check-panel" data-testid="offer-card">
                  <div className="brand-check-head">
                    <Tag />
                    <div><strong>{offersCopy.card.heading}</strong><span>{offer.title}</span></div>
                    <Badge variant="outline">{offer.expired ? offersCopy.status.expired : offersCopy.status[offer.status]}</Badge>
                  </div>
                  <dl className="asset-meta">
                    <div><dt>{offersCopy.meta.price}</dt><dd>{offer.priceText ?? offersCopy.meta.noPrice}</dd></div>
                    <div><dt>{offersCopy.meta.valid}</dt><dd>{offersCopy.meta.range.replace("{from}", formatOfferDate(offer.validFrom, locale)).replace("{until}", formatOfferDate(offer.validUntil, locale))}</dd></div>
                    <div><dt>{offersCopy.meta.revision}</dt><dd>{offer.revision}</dd></div>
                  </dl>
                </div>
              )}
              {/* P2.3 item 17: what the NEXT draft will be grounded in, shown
                  before generation -- not only the guardrail badge that judges
                  a draft after the fact. Collapsed by default to stay compact. */}
              {businessContext.length > 0 && (
                <details className="brand-check-panel">
                  <summary><strong>{ac.editor.businessDetails}</strong> <span>{ac.editor.businessDetailsHint}</span></summary>
                  <dl className="asset-meta">
                    {businessContext.map((row) => (
                      <div key={row.key}>
                        <dt>{resolveText(row.label, locale)}</dt>
                        <dd>{resolveText(row.value, locale)} <small>({resolveText(row.origin, locale)})</small></dd>
                      </div>
                    ))}
                  </dl>
                  <p className="limitation-note"><Link href={`${base}/business/profile`}>{ac.editor.editInBrand}</Link></p>
                </details>
              )}
              {checklistSteps && (
                <div className="brand-check-panel">
                  <div className="brand-check-head"><Check /><div><strong>{checklistCopy.heading}</strong><span>{checklistSteps.where}</span></div><Badge variant="outline">{effortLabel(action.effortMinutes, locale)}</Badge></div>
                  <ol className="evidence-list">{checklistSteps.steps.map((step) => <li key={step}><CheckCircle2 /> <span>{step}</span></li>)}</ol>
                  <p className="limitation-note"><AlertTriangle /> {checklistCopy.note}</p>
                </div>
              )}
              {/* The scan already collected these; showing them is what replaces
                  the blank "retype your reviews" form. Owner-typed text stays a
                  clearly-labelled fallback below, never collected evidence. */}
              {reviewEvidence && (
                <div className="brand-check-panel">
                  <div className="brand-check-head">
                    <FactType type={reviewEvidence.factType} />
                    <div>
                      <strong>{scanInputCopy.heading}</strong>
                      <span>{sourceLabel(action.evidence.source, locale)} · {formatDateTime(reviewEvidence.observedAt, locale, timezone)}</span>
                    </div>
                    <Badge variant="outline">{scanInputCopy.fromScan}</Badge>
                  </div>
                  <div className="version-list">
                    {reviewEvidence.reviews.map((review) => (
                      <div key={review.key}>
                        <span>{canEdit
                          ? <Checkbox
                              checked={selectedReviews.includes(review.key)}
                              disabled={busy === "inputs"}
                              aria-label={`${scanInputCopy.include}: ${review.excerpt.slice(0, 60) || `★ ${review.rating}`}`}
                              onCheckedChange={(checked) => void toggleReview(review.key, checked === true)}
                            />
                          : <MessageSquare />}</span>
                        <div>
                          <strong>{review.rating != null ? `★ ${review.rating}` : scanInputCopy.noOwnerReply}</strong>
                          <small>{review.excerpt}</small>
                          <small>{review.time ? formatDateTime(review.time, locale, timezone) : ""}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="limitation-note">
                    {scanInputCopy.selectedNote
                      .replace("{n}", String(selectedReviews.length))
                      .replace("{total}", String(reviewEvidence.reviews.length))}
                  </p>
                  <p className="limitation-note">
                    <AlertTriangle />{" "}
                    {scanInputCopy.limitation
                      .replace("{inspected}", String(reviewEvidence.inspected))
                      .replace("{unanswered}", String(reviewEvidence.available))}
                    {reviewEvidence.populationCount != null
                      ? scanInputCopy.population.replace("{total}", String(reviewEvidence.populationCount))
                      : ""}
                  </p>
                  {canEdit && (
                    <details>
                      <summary>{scanInputCopy.addOwn}</summary>
                      <div className="field-stack">
                        <Textarea
                          id="input-owner-review"
                          rows={3}
                          value={inputValues.reviews_without_response ?? ""}
                          onChange={(event) => setInputValues((prev) => ({ ...prev, reviews_without_response: event.target.value }))}
                          disabled={!canEdit}
                        />
                        <small>{scanInputCopy.addOwnNote}</small>
                        <div className="draft-editor-actions">
                          <Button
                            variant="outline"
                            onClick={() => void addOwnerReviewNote()}
                            disabled={!canEdit || dirty || !(inputValues.reviews_without_response ?? "").trim()}
                          >
                            {busy === "inputs" || busy === "run" ? <LoaderCircle className="animate-spin" /> : <WandSparkles />} {scanInputCopy.addOwnSubmit}
                          </Button>
                        </div>
                      </div>
                    </details>
                  )}
                </div>
              )}
              {showInputForm && (
                <form id="inputs" className="field-stack input-form" onSubmit={(event) => { event.preventDefault(); void submitInputs() }} aria-label={ac.editor.inputsAria}>
                  <p className="limitation-note"><AlertTriangle /> {ac.editor.neverGuesses}</p>
                  {neededKeys.map((key) => key === "asset_or_text_only" ? (
                    <div key={key} className="field-stack"><Label htmlFor={`input-${key}`}>{inputs[key] ?? key}</Label>
                      <Select disabled={!hydrated} value={inputValues[key] ?? ""} onValueChange={(value) => setInputValues((prev) => ({ ...prev, [key]: value }))}>
                        <SelectTrigger id={`input-${key}`} aria-label={inputs[key] ?? key}><SelectValue placeholder={ac.editor.assetPlaceholder} /></SelectTrigger>
                        <SelectContent><SelectItem value="text_only">{ac.editor.textOnly}</SelectItem>{approvedAssets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.filename}</SelectItem>)}</SelectContent>
                      </Select>
                      {approvedAssets.length === 0 && <small>{ac.editor.noAssets} <Link href={`${base}/business/assets`}>{ac.editor.goToAssets}</Link></small>}
                    </div>
                  ) : (
                    <div key={key} className="field-stack"><Label htmlFor={`input-${key}`}>{faqQuestionByKey.get(key) ? resolveText(faqQuestionByKey.get(key)!.question, locale) : (inputs[key] ?? key)}</Label>{key.startsWith("owner_fact") || key === "menu_items" || key === "reviews_without_response" ? <Textarea id={`input-${key}`} rows={3} value={inputValues[key] ?? faqQuestionByKey.get(key)?.prefill ?? ""} onChange={(event) => setInputValues((prev) => ({ ...prev, [key]: event.target.value }))} disabled={!canEdit} /> : <Input id={`input-${key}`} value={inputValues[key] ?? ""} onChange={(event) => setInputValues((prev) => ({ ...prev, [key]: event.target.value }))} disabled={!canEdit} />}{faqQuestionByKey.get(key)?.prefill && <small>{ac.editor.prefilled}</small>}</div>
                  ))}
                  <div className="draft-editor-actions"><Button type="submit" disabled={!canEdit || (!checklistSteps && dirty)}>{busy === "inputs" || busy === "run" ? <LoaderCircle className="animate-spin" /> : checklistSteps ? <Save /> : <WandSparkles />} {checklistSteps ? checklistCopy.saveInputs : ac.editor.saveAndGenerate}</Button></div>
                </form>
              )}
              {!checklistSteps && (<>
              <div className="field-stack"><Label htmlFor="draft-content">{social ? ac.editor.caption : ac.editor.draft}</Label><Textarea id="draft-content" value={content} onChange={(event) => setContent(event.target.value)} rows={social ? 8 : 7} disabled={!canEdit} placeholder={selectedVersion ? undefined : ac.editor.placeholder} /><div className="field-helper-row"><span>{content.length} {ac.editor.characters}</span><span>{selectedVersion ? formatDateTime(selectedVersion.created_at, locale, timezone) : ""}</span></div></div>
              {(social || altText) && <div className="field-stack"><Label htmlFor="alt-text">{ac.editor.altText}</Label><Textarea id="alt-text" value={altText} onChange={(event) => setAltText(event.target.value)} rows={3} disabled={!canEdit} /><small>{ac.editor.altTextNote}</small></div>}
              {/* The agents compute guardrail violations and artifacts.ts
                  persists them into meta.warnings, but nothing ever read them
                  back: this panel showed a hard-coded "1 reminder" on every
                  draft, so a prohibited brand term or a compensation promise
                  looked exactly like a clean one to the person approving it. */}
              <div className="brand-check-panel"><div className="brand-check-head"><ShieldCheck /><div><strong>{ac.editor.guardrailTitle}</strong><span>{ac.editor.guardrailSubtitle}</span></div><Badge variant="outline">{guardrailBadge}</Badge></div>
                {guardrailFlags.length > 0
                  ? <ul className="evidence-list">{guardrailFlags.map((flag, index) => <li key={`${flag.code}-${index}`}><AlertTriangle /> <span>{guardrailText(flag, locale)}</span></li>)}</ul>
                  : <p><ShieldCheck /> {selectedVersion?.checked
                      ? ac.editor.checkedClean
                      : ac.editor.notAgentChecked}</p>}
                {(selectedVersion?.agentNotes ?? []).map((note) => <p key={note} className="limitation-note"><AlertTriangle /> {note}</p>)}
                <p className="limitation-note">{ac.editor.noInventedFacts}</p></div>
              {needsRunReconciliation && <div className="conflict-state" role="alert"><CircleAlert /><div><strong>{ac.editor.reconcileTitle}</strong><p>{ac.editor.reconcileBody}</p><Button variant="outline" onClick={() => window.location.reload()}>{ac.editor.reconcileReload}</Button></div></div>}
              {lastRunError && <p className="limitation-note" role="alert"><CircleAlert /> {ac.editor.lastRunFailed}{runErrorLabel(locale, lastRunError)}</p>}
              {pendingSelect && <div className="draft-editor-actions" role="status"><span>{t(locale, "editor.waitingForVersion")}</span><Button variant="outline" onClick={() => router.refresh()}>{t(locale, "editor.retryVersion")}</Button></div>}
              <div className="draft-editor-actions"><ContextualAssistant locale={locale} surface={social ? "create" : "action"} triggerLabel={ac.editor.reviseWithOperator} mode="live" context={{ workspaceId, locationId: action.location.id ?? undefined, actionId: action.id, versionId: selectedVersion?.id }} basePath={base} locationParam={location} reviewDraft={action.templateKey === "review-response"} onCreateVersion={dirty ? undefined : createAssistantVersion} disabled={!canEdit || dirty} /><Button variant="outline" onClick={() => void generate()} disabled={!canGenerate || showInputForm}>{busy === "run" ? <LoaderCircle className="animate-spin" /> : <WandSparkles />} {selectedVersion ? ac.editor.regenerate : ac.editor.generate}</Button><Button onClick={() => void saveDraft()} disabled={!canEdit || !dirty}>{busy === "save" ? <LoaderCircle className="animate-spin" /> : <Save />} {ac.editor.saveManual}</Button></div>
              <p role="status" aria-live="polite">{busy === "save" ? ac.editor.saving : pendingSelect ? t(locale, "editor.waitingForVersion") : saveFailed ? ac.editor.saveFailed : dirty ? ac.editor.unsaved : selectedVersion ? fill(ac.editor.saved, { version: versionName }) : ac.editor.noSavedDraft}</p>
              {comparing && <section className="field-stack" aria-label={ac.editor.compareAria}>
                {versions[0] && versions[0].id !== versionId ? <>
                  <Label htmlFor="latest-saved-draft">{ac.editor.latestSaved}</Label>
                  <Textarea id="latest-saved-draft" value={versions[0].body} readOnly rows={7} />
                  {versions[0].alt_text && <p>{ac.editor.altTextPrefix}{versions[0].alt_text}</p>}
                  <p>{ac.editor.compareHelp}</p>
                  <div className="draft-editor-actions">
                    <Button onClick={() => resolveConflict(true)}>{fill(ac.editor.keepEdits, { n: versions[0].version_no })}</Button>
                    <Button variant="outline" onClick={() => resolveConflict(false)}>{ac.editor.discardEdits}</Button>
                  </div>
                </> : <p role="status">{ac.editor.waitingLatest}</p>}
              </section>}
              {dirty && <p className="limitation-note">{saveBeforeGenerationMessage}</p>}
              {conflict && <div className="conflict-state" role="alert"><ShieldAlert /><div><strong>{ac.editor.conflictTitle}</strong><p>{ac.editor.conflictBody}</p><Button size="sm" onClick={loadLatest}><RefreshCw /> {ac.editor.loadLatest}</Button></div></div>}
              </>)}
              {/* The assertion control, offered for checklist and drafted
                  actions alike. Before: an offer to record what the owner tells
                  us. After: the date they said it, and that nobody verified it. */}
              {/* Visibility is role-and-scope only, deliberately not `canEdit`:
                  that also carries hydration and busy state, so gating the
                  markup on it would make the control vanish server-side and
                  mid-request. A viewer has nothing to assert, so they get no
                  control at all rather than a disabled one. */}
              {!canAssert ? null : applied ? (
                <div className="approved-state">
                  <CheckCircle2 />
                  <div>
                    <strong>{t(locale, "applied.assertedOn", { date: appliedOn })}</strong>
                    <span>{t(locale, "applied.retractHint")}</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void retractApplied()} disabled={!canEdit}>{busy === "applied" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} {t(locale, "applied.retract")}</Button>
                </div>
              ) : (
                <div className="draft-editor-actions">
                  <Button onClick={() => void markApplied()} disabled={!canEdit}>{busy === "applied" ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />} {t(locale, "applied.markButton")}</Button>
                  <p className="limitation-note">{t(locale, "applied.markHint")}</p>
                </div>
              )}
              {/* System-written, not the owner's claim -- so unlike the
                  applied control above there is nothing here to retract. Text
                  only, with the trailing clause stating exactly what a fetch
                  can and cannot establish. */}
              {verified && (
                <p className="limitation-note">{t(locale, "verified.confirmedOn", { date: verifiedOn })}</p>
              )}
            </SectionCard>

            {checklistSteps ? (
              <aside className="approval-panel">
                <SectionCard>
                  <p className="eyebrow">{ac.checklistPanel.eyebrow}</p>
                  <h2>{ac.checklistPanel.title}</h2>
                  <p>{checklistCopy.note}</p>
                  <dl className="state-machine-dl">
                    <div><dt>{ac.checklistPanel.action}</dt><dd><Badge variant="outline">{stateLabel(action.actionState, locale)}</Badge></dd></div>
                    <div><dt>{ac.checklistPanel.measurement}</dt><dd><Badge variant="outline">{stateLabel(action.measurementState, locale)}</Badge></dd></div>
                  </dl>
                  <p className="limitation-note">{ac.checklistPanel.note}</p>
                </SectionCard>
              </aside>
            ) : (
            <aside className="approval-panel">
              <SectionCard>
                <p className="eyebrow">{ac.approval.eyebrow}</p><h2>{isApprovedCurrent ? fill(ac.approval.approvedTitle, { version: versionName }) : ac.approval.safeDecision}</h2><p>{ac.approval.scope}</p>
                <div className="field-stack"><Label htmlFor="reviewer-comment">{ac.approval.comment}</Label><Textarea id="reviewer-comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder={ac.approval.commentPlaceholder} rows={3} disabled={!canApprove} /></div>
                {isApprovedCurrent && selectedVersion ? <div className="approved-state"><CheckCircle2 /><div><strong>{ac.approval.approved}</strong><span>{formatDateTime(selectedVersion.approved_at, locale, timezone)} · {versionName}{selectedVersion.reviewer_comment ? ` · ${selectedVersion.reviewer_comment}` : ""}</span></div></div> : <div className="decision-stack">
                  {dirty && <p className="limitation-note"><AlertTriangle /> {ac.approval.saveFirst}</p>}
                  <Dialog><DialogTrigger asChild><Button disabled={!canApproveCurrent}><BadgeCheck /> {fill(ac.approval.approve, { version: versionName })}</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{ac.approval.dialogTitle}</DialogTitle><DialogDescription>{fill(ac.approval.dialogBody, { version: versionName })}</DialogDescription></DialogHeader><div className="confirm-summary"><strong>{resolveText(action.title, locale)}</strong><span>{locationName} · {sourceLabel(action.evidence.source, locale)}</span></div><DialogFooter><DialogClose asChild><Button variant="outline">{ac.approval.keepReviewing}</Button></DialogClose><DialogClose asChild><Button onClick={() => void approveDraft()}>{fill(ac.approval.approve, { version: versionName })}</Button></DialogClose></DialogFooter></DialogContent></Dialog>
                  <Button variant="outline" onClick={() => void setDecision("changes_requested")} disabled={!canApprove || dirty || approval === "changes_requested"}><PencilLine /> {ac.approval.requestChanges}</Button>
                  <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" className="text-destructive" disabled={!canApprove || dirty || approval === "rejected"}><X /> {ac.approval.reject}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{ac.approval.rejectTitle}</AlertDialogTitle><AlertDialogDescription>{ac.approval.rejectBody}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{ac.approval.cancel}</AlertDialogCancel><AlertDialogAction onClick={() => void setDecision("rejected")}>{ac.approval.rejectVersion}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                </div>}
              </SectionCard>
              <SectionCard className="delivery-card"><div className="section-card-heading"><div><p className="eyebrow">{ac.delivery.eyebrow}</p><h2>{social ? ac.delivery.titleSocial : ac.delivery.title}</h2></div><CapabilityBadge value={publishPanel ? googleBusinessPublishCapability({ enabled: publishPanel.enabled, connectionActive: publishPanel.connectionActive }) : "Requires connection"} /></div><p>{publishPanel?.enabled ? copy[locale].workspace.publish.deliveryIntro : ac.delivery.noConnector}</p>
                {allowanceBlocked && <div className="conflict-state" role="alert"><ShieldAlert /><div><strong>{ac.delivery.allowanceTitle}</strong><p>{ac.delivery.allowanceBody}</p><Button asChild size="sm" variant="outline"><Link href={`${base}/settings/plan`}>{ac.delivery.billing}</Link></Button></div></div>}
                <Button className="w-full" variant={isApprovedCurrent ? "default" : "outline"} disabled={!canDeliver} onClick={() => void deliver("export")}>{busy === "export" ? <LoaderCircle className="animate-spin" /> : exported ? <Check /> : <Download />} {exported ? ac.delivery.exportAgain : ac.delivery.exportApproved}</Button>
                <Button className="w-full" variant="outline" disabled={!canDeliver} onClick={() => void deliver("copy")}>{busy === "copy" ? <LoaderCircle className="animate-spin" /> : <Copy />} {ac.delivery.copyText}</Button>
                {publishPanel && selectedVersion && <GbpPublishCard locale={locale} versionId={selectedVersion.id} versionNo={selectedVersion.version_no} body={selectedVersion.body} approved={isApprovedCurrent} panel={effectiveRole === role ? publishPanel : { ...publishPanel, mayAct: publishPanel.mayAct && effectiveRole !== "viewer", canPublish: publishPanel.canPublish && effectiveRole !== "viewer", canDelete: false }} workspaceSlug={workspaceSlug} timezone={timezone} onChanged={() => router.refresh()} />}
                {!publishPanel?.enabled && <Button className="w-full" variant="ghost" disabled><Send /> {ac.delivery.publishDirect}</Button>}
              </SectionCard>
            </aside>
            )}
          </div>
        </TabsContent>

        <TabsContent value="evidence">
          <EvidenceTab action={action} measurements={measurements} locale={locale} timezone={timezone} locationName={locationName} />
        </TabsContent>

        <TabsContent value="workflow">
          <WorkflowTab action={action} runs={runs} workflowState={workflowState} workflowLabel={workflowLabel} approvalLabel={approvalText(approval)} delivery={delivery} locale={locale} timezone={timezone} />
        </TabsContent>

        <TabsContent value="history">
          <div className="history-layout">
            <SectionCard><p className="eyebrow">{ac.history.eyebrow}</p><h2>{ac.history.title}</h2>
              {versions.length === 0 ? <p>{ac.history.none}</p> : <div className="version-list">{versions.map((item) => <button key={item.id} type="button" disabled={!hydrated} onClick={() => selectVersion(item.id)} aria-pressed={versionId === item.id} className={versionId === item.id ? "is-active" : ""}><span><History /></span><div><strong>{versionLabel(item.version_no)} · {stateLabel(item.approval_state, locale)}</strong><small>{item.author_type === "agent" ? ac.history.agent : ac.history.member} · {formatDateTime(item.created_at, locale, timezone)}{item.reviewer_comment ? ` · ${item.reviewer_comment}` : ""}</small></div>{versionId === item.id && <Check />}</button>)}</div>}
            </SectionCard>
            <SectionCard><div className="section-card-heading"><div><p className="eyebrow">{ac.history.safetyEyebrow}</p><h2>{ac.history.safetyTitle}</h2></div></div>
              {conflict ? <div className="conflict-state" role="alert"><ShieldAlert /><div><strong>{ac.editor.conflictTitle}</strong><p>{ac.editor.conflictBody}</p><Button size="sm" onClick={loadLatest}><RefreshCw /> {ac.editor.loadLatest}</Button></div></div> : <div className="idempotent-state"><CheckCircle2 /><div><strong>{ac.history.noConflict}</strong><p>{ac.history.idempotent}</p></div></div>}
              <div className="audit-mini">{relatedAudit.length === 0 ? <div><span>—</span><p>{ac.history.noAudit}</p></div> : relatedAudit.map((row) => <div key={row.id}><span>{formatDateTime(row.created_at, locale, timezone)}</span><p><strong>{auditEventLabel(row.event, locale)}</strong> · {auditActorLabel(row.actor_type, locale !== "en")}{typeof row.payload?.version_no === "number" ? ` · ${versionLabel(row.payload.version_no)}` : ""}</p></div>)}</div>
            </SectionCard>
          </div>
        </TabsContent>
      </Tabs>

      <div className="sticky-approval-bar"><div><span className="sticky-status"><FileClock /></span><span><strong>{versionName} · {dirty ? ac.sticky.unsaved : approvalText(approval)}</strong><small>{effectiveRole === "viewer" ? ac.sticky.viewer : ac.sticky.note}</small></span></div><div><Button variant="outline" onClick={() => void saveDraft()} disabled={!canEdit || !dirty}><Save /> {ac.sticky.save}</Button><Button onClick={() => void (isApprovedCurrent ? deliver("export") : approveDraft())} disabled={isApprovedCurrent ? !canDeliver : !canApproveCurrent}>{isApprovedCurrent ? <><Download /> {ac.provenance.export}</> : <><BadgeCheck /> {ac.sticky.approve}</>}</Button></div></div>
    </div>
  )
}
