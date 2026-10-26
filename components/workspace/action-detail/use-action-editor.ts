import { useRouter } from "next/navigation"
import { useRef, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { copy } from "@/lib/copy"
import { resolveText } from "@/lib/domain"
import { t } from "@/lib/i18n"
import { fill } from "@/lib/copy-ui"
import { offerStaleKind, type OfferStaleKind } from "@/lib/workspace/offer-format"
import { formatDateTime, stateLabel } from "@/lib/workspace/format"
import type { VersionRow } from "@/lib/workspace/queries-pages"
import { clientHydrated, serverHydrated, subscribeHydration, subscribeOnline } from "@/components/workspace/action-detail/helpers"
import { sourceLabel } from "@/lib/workspace/source-label"
import { actionVerificationView } from "@/lib/workspace/action-verification"
import { EMPTY_OWNER_CHECK, ownerCheckNextStep } from "@/lib/workspace/owner-review-check"
import { createEditorActions } from "@/components/workspace/action-detail/editor-actions"
import type { ActionDetailClientProps, Busy, PreviewRole } from "@/components/workspace/action-detail/types"

/**
 * The action editor's state and everything derived from it, read during render.
 * Versions arrive from the server; the editor re-points itself after a refresh
 * without losing unsaved local text (see the render-phase adjustments below).
 */
function useEditorState({ locale, workspaceSlug, workspaceId, timezone, role, inScope, location, detail, auditRows, locations, approvedAssets, offer = null, latestVersionOfferRevision = null, offersEnabled = false, initialVersionId = null, publishPanel = null, ownerCheck = EMPTY_OWNER_CHECK, ownerCheckIdentity, embedded = false }: ActionDetailClientProps) {
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
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
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


  return {
    ac, action, allowanceBlocked, altText, applied, appliedOn, approval, approvalText, approvedAssets, base,
    businessContext, busy, canApprove, canApproveCurrent, canAssert, canDeliver, canEdit, canGenerate, checklistCopy,
    checklistSteps, comment, comparing, conflict, content, delivery, dirty, effectiveRole, embedded, exported,
    editingVersionId, setEditingVersionId, confirmOpen, setConfirmOpen,
    faqQuestionByKey, guardrailBadge, guardrailFlags, hydrated, inputs, inputValues, inScope, isApprovedCurrent,
    lastRunError, locale, location, locationName, measurements, mutationPending, neededKeys, needsRunReconciliation, offer,
    offersCopy, offersEnabled, offerStale, offline, ownerCheck, ownerCheckIdentity, pendingSelect, previewRole, provenance,
    publishPanel, relatedAudit, reviewEvidence, role, roleName, router, runs, saveBeforeGenerationMessage, saveFailed,
    scanInputCopy, selectedReviews, selectedVersion, selectVersion, setAllowanceBlocked, setAltText, setBusy, setComment,
    setComparing, setConflict, setContent, setFactsNeeded, setInputValues, setLastRunError, setNeedsRunReconciliation,
    setOfferRefusal, setPendingSelect, setPreviewRole, setSaveFailed, setSelectedReviews, setVersionId, showInputForm,
    showVerification, social, timezone, verification, verificationCopy, verificationNext, verified, verifiedOn, versionId,
    versionLabel, versionName, versions, workflowLabel, workflowState, workspaceId, workspaceSlug
  }
}

export type EditorState = ReturnType<typeof useEditorState>

/** State plus the mutations that act on it, for the action detail's sections. */
export function useActionEditor(props: ActionDetailClientProps) {
  const state = useEditorState(props)
  return { ...state, ...createEditorActions(state) }
}

export type ActionEditor = ReturnType<typeof useActionEditor>
