import Link from "next/link"
import { AlertTriangle, BadgeCheck, Check, CheckCircle2, Copy, Download, LoaderCircle, PencilLine, Send, ShieldAlert, X } from "lucide-react"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { GbpPublishCard } from "@/components/workspace/gbp-publish-card"
import { CapabilityBadge, SectionCard } from "@/components/product-ui"
import { copy } from "@/lib/copy"
import { googleBusinessPublishCapability } from "@/lib/capabilities"
import { resolveText } from "@/lib/domain"
import { fill } from "@/lib/copy-ui"
import { formatDateTime, stateLabel } from "@/lib/workspace/format"
import { sourceLabel } from "@/lib/workspace/source-label"
import type { ActionEditor } from "@/components/workspace/action-detail/use-action-editor"

/** The approval decision for one immutable version and its export, or how a checklist action is completed. */
export function ApprovalPanel({ ed }: { ed: ActionEditor }) {
  const {
    ac, action, allowanceBlocked, approval, approveDraft, base, busy, canApprove, canApproveCurrent, canDeliver,
    checklistCopy, checklistSteps, comment, deliver, dirty, effectiveRole, exported, isApprovedCurrent, locale,
    locationName, publishPanel, role, router, selectedVersion, setComment, setDecision, social, timezone, versionName,
    workspaceSlug
  } = ed
  return (
    <>
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
    </>
  )
}
