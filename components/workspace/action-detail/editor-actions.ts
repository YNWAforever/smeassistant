import { toast } from "sonner"

import type { DemoAssistantRunResponse } from "@/lib/pocket-assistant/contracts"
import { copyToClipboard, downloadText } from "@/lib/download"
import { approveVersion, decideVersion, exportVersion, markApplied as markAppliedRequest, retractApplied as retractAppliedRequest, runAction, saveAssistantVersion, saveVersion, updateAction, type ClientResult } from "@/lib/workspace/client"
import { t } from "@/lib/i18n"
import { fill } from "@/lib/copy-ui"
import { aiBudgetRefusal } from "@/lib/budgets/messages"
import { runErrorLabel } from "@/lib/assistant/draft-failure"
import { isOfferStaleCode } from "@/lib/workspace/offer-format"
import { buildExportText } from "@/lib/workspace/format"
import { ownerInputPatch } from "@/components/workspace/action-detail/helpers"
import type { EditorState } from "@/components/workspace/action-detail/use-action-editor"

/**
 * The editor's mutations. Each reads the state of the render it was created in,
 * exactly as the closures inside the component did, and goes through the
 * workspace routes, which re-check role, scope and state server-side.
 */
export function createEditorActions(state: EditorState) {
  const {
    ac, action, altText, applied, canApprove, canApproveCurrent, canDeliver, canEdit, canGenerate, checklistSteps, comment,
    conflict, content, dirty, inputValues, locale, mutationPending, neededKeys, needsRunReconciliation, offersCopy,
    reviewEvidence, router, saveBeforeGenerationMessage, scanInputCopy, selectedReviews, selectedVersion,
    setAllowanceBlocked, setAltText, setBusy, setComment, setComparing, setConflict, setContent, setFactsNeeded,
    setLastRunError, setNeedsRunReconciliation, setOfferRefusal, setPendingSelect, setSaveFailed, setSelectedReviews,
    setVersionId, versionId, versionName, versions
  } = state

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

  return {
    generate, submitInputs, markApplied, retractApplied, toggleReview, addOwnerReviewNote, saveDraft,
    createAssistantVersion, loadLatest, resolveConflict, approveDraft, setDecision, deliver
  }
}
