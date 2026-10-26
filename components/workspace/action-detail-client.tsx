"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { AlertTriangle, Check, CloudOff } from "lucide-react"
import { toast } from "sonner"

import { RoleNotice } from "@/components/states/role-notice"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { copy, homeReviewCopy } from "@/lib/copy"
import { withLocation } from "@/lib/workspace/format"
import { EvidenceTab } from "@/components/workspace/action-detail/evidence-tab"
import { OwnerSteps, ownerStepIndex } from "@/components/workspace/action-detail/owner-steps"
import { WorkflowTab } from "@/components/workspace/action-detail/workflow-tab"
import { DetailHeader } from "@/components/workspace/action-detail/detail-header"
import { VerificationResult } from "@/components/workspace/action-detail/verification-result"
import { DraftEditorCard } from "@/components/workspace/action-detail/draft-editor-card"
import { ApprovalPanel } from "@/components/workspace/action-detail/approval-panel"
import { HistoryTab } from "@/components/workspace/action-detail/history-tab"
import { StickyApprovalBar } from "@/components/workspace/action-detail/sticky-approval-bar"
import { useActionEditor } from "@/components/workspace/action-detail/use-action-editor"
import type { ActionDetailClientProps } from "@/components/workspace/action-detail/types"

export type { ActionDetailClientProps, OfferCardData } from "@/components/workspace/action-detail/types"
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

/** The action detail: header, the 改稿 → 確認 → 發出 path, then evidence and history. Agent run stays in a closed disclosure. */
function ActionDetailEditor(props: ActionDetailClientProps) {
  const ed = useActionEditor(props)
  const {
    ac, action, approval, approvalText, base, delivery, effectiveRole, inScope, locale, location, locationName,
    measurements, offersCopy, offersEnabled, offerStale, offline, provenance, role, router, runs, timezone, workflowLabel,
    workflowState
  } = ed
  return (
    <div className="action-detail-page">
      <DetailHeader ed={ed} />

      <VerificationResult ed={ed} />

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

      {action.delivery !== "checklist" && <OwnerSteps locale={locale} index={ownerStepIndex({ isApprovedCurrent: ed.isApprovedCurrent, dirty: ed.dirty, approval, hasVersion: ed.selectedVersion != null })} />}

      <Tabs defaultValue="draft" className="action-detail-tabs">
        <TabsList variant="line" className="detail-tab-list"><TabsTrigger value="draft">{ac.tabs.draft}</TabsTrigger><TabsTrigger value="evidence">{ac.tabs.evidence}</TabsTrigger><TabsTrigger value="history">{ac.tabs.history}</TabsTrigger></TabsList>

        <TabsContent value="draft">
          <div className="draft-layout">
            <DraftEditorCard ed={ed} />

            <ApprovalPanel ed={ed} />
          </div>
        </TabsContent>

        <TabsContent value="evidence">
          <EvidenceTab action={action} measurements={measurements} locale={locale} timezone={timezone} locationName={locationName} />
        </TabsContent>

        <TabsContent value="history">
          <HistoryTab ed={ed} />
        </TabsContent>
      </Tabs>

      <details className="owner-disclosure owner-workflow-disclosure">
        <summary>{copy[locale].ownerFocus.workflow}</summary>
        <ol className="provenance-chain" aria-label={ac.provenance.aria}>
          {provenance.map((item, index) => <li key={item.label} className={`is-${item.state}`}><span className="provenance-node">{item.state === "complete" ? <Check /> : index + 1}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div></li>)}
        </ol>
        <WorkflowTab action={action} runs={runs} workflowState={workflowState} workflowLabel={workflowLabel} approvalLabel={approvalText(approval)} delivery={delivery} locale={locale} timezone={timezone} />
      </details>

      <StickyApprovalBar ed={ed} />
    </div>
  )
}
