import Link from "next/link"
import { ArrowLeft, Check, Clock3, CloudOff, MapPin, UserRound } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CapabilityBadge } from "@/components/product-ui"
import { resolveText } from "@/lib/domain"
import { fill } from "@/lib/copy-ui"
import { effortLabel, formatDateTime, priorityClass, priorityLabel, withLocation } from "@/lib/workspace/format"
import type { PreviewRole } from "@/components/workspace/action-detail/types"
import type { ActionEditor } from "@/components/workspace/action-detail/use-action-editor"

/** Toolbar (back link, preview role, connection state) and the action's header with its direct next step. */
export function DetailHeader({ ed }: { ed: ActionEditor }) {
  const {
    ac, action, approval, approvalText, base, dirty, effectiveRole, embedded, hydrated, isApprovedCurrent, locale, location,
    locationName, offline, previewRole, role, roleName, selectedVersion, setPreviewRole, showInputForm, timezone,
    verificationNext, versionName
  } = ed
  return (
    <>
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
    </>
  )
}
