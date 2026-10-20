import { BadgeCheck, Download, FileClock, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ActionEditor } from "@/components/workspace/action-detail/use-action-editor"

/** The bar that keeps save and approve/export in reach while the draft scrolls. */
export function StickyApprovalBar({ ed }: { ed: ActionEditor }) {
  const {
    ac, approval, approvalText, approveDraft, canApproveCurrent, canDeliver, canEdit, deliver, dirty, effectiveRole,
    isApprovedCurrent, saveDraft, versionName
  } = ed
  return (
    <div className="sticky-approval-bar"><div><span className="sticky-status"><FileClock /></span><span><strong>{versionName} · {dirty ? ac.sticky.unsaved : approvalText(approval)}</strong><small>{effectiveRole === "viewer" ? ac.sticky.viewer : ac.sticky.note}</small></span></div><div><Button variant="outline" onClick={() => void saveDraft()} disabled={!canEdit || !dirty}><Save /> {ac.sticky.save}</Button><Button onClick={() => void (isApprovedCurrent ? deliver("export") : approveDraft())} disabled={isApprovedCurrent ? !canDeliver : !canApproveCurrent}>{isApprovedCurrent ? <><Download /> {ac.sticky.export}</> : <><BadgeCheck /> {ac.sticky.approve}</>}</Button></div></div>
  )
}
