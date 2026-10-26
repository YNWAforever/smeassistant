import Link from "next/link"
import { Copy, Download, LoaderCircle } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CapabilityBadge, SectionCard } from "@/components/product-ui"
import { GbpPublishCard } from "@/components/workspace/gbp-publish-card"
import { fill } from "@/lib/copy-ui"
import { resolveText } from "@/lib/domain"
import { formatDateTime, priorityLabel } from "@/lib/workspace/format"
import { editorStep } from "./owner-steps"
import type { ActionEditor } from "./use-action-editor"

/** Both page and sticky controls open this single exact-version confirmation. */
export function ConfirmVersionDialog({ ed }: { ed: ActionEditor }) {
  const { ac, action, locale, versionName, confirmOpen, setConfirmOpen, approveDraft, canApproveCurrent } = ed
  return <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}><DialogContent><DialogHeader>
    <DialogTitle>{ac.approval.dialogTitle}</DialogTitle><DialogDescription>{fill(ac.approval.dialogBody, { version: versionName })}</DialogDescription>
    </DialogHeader><p>{resolveText(action.title, locale)}</p><DialogFooter>
    <DialogClose asChild><Button variant="outline">{ac.approval.keepReviewing}</Button></DialogClose>
    <DialogClose asChild><Button disabled={!canApproveCurrent} onClick={() => void approveDraft()}>{fill(ac.approval.approve, { version: versionName })}</Button></DialogClose>
  </DialogFooter></DialogContent></Dialog>
}

export function StepPrimary({ ed }: { ed: ActionEditor }) {
  const step = editorStep(ed)
  if (step === 2) return <Button disabled={!ed.canDeliver} onClick={() => void ed.deliver("copy")}><Copy /> {ed.ac.delivery.copyText}</Button>
  if (step === 1) return <Button disabled={!ed.canApproveCurrent} onClick={() => ed.setConfirmOpen(true)}>{fill(ed.ac.approval.approve, { version: ed.versionName })}</Button>
  return ed.dirty
    ? <Button disabled={!ed.canEdit} onClick={() => void ed.saveDraft()}>{ed.ac.editor.saveManual}</Button>
    : <Button disabled={!ed.canGenerate || ed.showInputForm} onClick={() => void ed.generate()}>{ed.selectedVersion ? ed.ac.editor.regenerate : ed.ac.editor.generate}</Button>
}

export function ApprovalPanel({ ed }: { ed: ActionEditor }) {
  const { ac, canApprove, dirty, selectedVersion, setEditingVersionId, publishPanel, locale, allowanceBlocked, base } = ed
  const step = editorStep(ed)
  if (ed.checklistSteps || step === 0) return null
  return <div className="approval-panel"><SectionCard className={step === 2 ? "delivery-card" : undefined}>
    {step === 1 ? <>
      <StepPrimary ed={ed} />
      <Button variant="ghost" disabled={!canApprove || dirty} onClick={() => {
        if (selectedVersion) setEditingVersionId(selectedVersion.id)
      }}>{ac.approval.requestChanges}</Button>
    </> : <>
      <p>{publishPanel?.enabled && publishPanel.connectionActive
        ? locale === "zh-HK" ? "複製唔會自動貼上；要貼去 Google，請再確認發佈。" : "Copying does not post anything. Confirm publishing separately to post to Google."
        : ac.delivery.noConnector}</p>
      {allowanceBlocked && <div role="alert"><strong>{ac.delivery.allowanceTitle}</strong><p>{ac.delivery.allowanceBody}</p><Link href={`${base}/settings/plan`}>{ac.delivery.billing}</Link></div>}
      <StepPrimary ed={ed} />
      <PublishControls ed={ed} />
    </>}
  </SectionCard></div>
}

/** File output and the less common refusal remain available behind Why. */
export function VersionDetails({ ed }: { ed: ActionEditor }) {
  const { ac } = ed
  return <>
    <p className="action-detail-badges">{resolveText(ed.action.displayPhase, ed.locale)} · {priorityLabel(ed.action.priority, ed.locale)}</p>
    <CapabilityBadge value={ed.action.capability} context="action" />
    {ed.selectedVersion && <div className="approved-state version-approval-record"><strong>{ed.isApprovedCurrent ? fill(ac.approval.approvedTitle, { version: ed.versionName }) : ed.approvalText(ed.approval)}</strong><span>{formatDateTime(ed.selectedVersion.approved_at, ed.locale, ed.timezone)}{ed.selectedVersion.reviewer_comment ? ` · ${ed.selectedVersion.reviewer_comment}` : ""}</span></div>}
    {ed.isApprovedCurrent && ed.selectedVersion && <Button variant="ghost" disabled={!ed.canEdit} onClick={() => ed.setEditingVersionId(ed.selectedVersion!.id)}>{ac.ownerSteps.edit}</Button>}
    {editorStep(ed) !== 2 && ed.selectedVersion && ed.publishPanel?.deliveries.some((row) => row.versionId === ed.selectedVersion!.id) && <PublishControls ed={ed} />}
    {ed.selectedVersion && !ed.isApprovedCurrent && <div className="field-stack"><Label htmlFor="reviewer-comment">{ac.approval.comment}</Label><Textarea id="reviewer-comment" value={ed.comment} onChange={(event) => ed.setComment(event.target.value)} disabled={!ed.canApprove} rows={3} /></div>}
    {ed.selectedVersion && !ed.isApprovedCurrent && <details><summary>{ac.approval.requestChanges}</summary><Button disabled={!ed.canApprove || ed.dirty || ed.approval === "changes_requested"} onClick={() => void ed.setDecision("changes_requested")}>{ed.locale === "zh-HK" ? "記低呢版要改" : "Record requested changes"}</Button><details><summary>{ac.approval.reject}</summary><AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" disabled={!ed.canApprove || ed.dirty || ed.approval === "rejected"}>{ac.approval.reject}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{ac.approval.rejectTitle}</AlertDialogTitle><AlertDialogDescription>{ac.approval.rejectBody}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{ac.approval.cancel}</AlertDialogCancel><AlertDialogAction onClick={() => void ed.setDecision("rejected")}>{ac.approval.rejectVersion}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></details></details>}
    {ed.isApprovedCurrent && <Button variant="outline" disabled={!ed.canDeliver} onClick={() => void ed.deliver("export")}>{ed.busy === "export" ? <LoaderCircle /> : <Download />} {ed.exported ? ac.delivery.exportAgain : ac.delivery.exportApproved}</Button>}
  </>
}

/** Existing publish receipts/reconciliation survive moving back to an older version. */
function PublishControls({ ed }: { ed: ActionEditor }) {
  const { publishPanel, selectedVersion, locale, effectiveRole, role, workspaceSlug, timezone, router } = ed
  return (
    <>{publishPanel && selectedVersion && (publishPanel.enabled && publishPanel.connectionActive || publishPanel.deliveries.some((row) => row.versionId === selectedVersion.id)) && <GbpPublishCard locale={locale} versionId={selectedVersion.id} versionNo={selectedVersion.version_no} body={selectedVersion.body} approved={ed.isApprovedCurrent} panel={effectiveRole === role ? publishPanel : { ...publishPanel, mayAct: publishPanel.mayAct && effectiveRole !== "viewer", canPublish: publishPanel.canPublish && effectiveRole !== "viewer", canDelete: false }} workspaceSlug={workspaceSlug} timezone={timezone} onChanged={() => router.refresh()} />}</>
  )
}
