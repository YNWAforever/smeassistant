import { Check, CheckCircle2, History, RefreshCw, ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SectionCard } from "@/components/product-ui"
import { copy } from "@/lib/copy"
import { auditActorLabel, auditEventLabel } from "@/lib/workspace/audit-labels"
import { formatDateTime, stateLabel } from "@/lib/workspace/format"
import type { ActionEditor } from "@/components/workspace/action-detail/use-action-editor"

/** Version history and the conflict/idempotency state with the latest audit events. */
export function HistoryTab({ ed }: { ed: ActionEditor }) {
  const { ac, conflict, hydrated, loadLatest, locale, relatedAudit, selectVersion, timezone, versionId, versionLabel, versions } = ed
  return (
    <div className="history-layout">
      <SectionCard><p className="eyebrow">{ac.history.eyebrow}</p><h2>{ac.history.title}</h2>
        {versions.length === 0 ? <p>{ac.history.none}</p> : <div className="version-list">{versions.map((item) => <button key={item.id} type="button" disabled={!hydrated} onClick={() => selectVersion(item.id)} aria-pressed={versionId === item.id} className={versionId === item.id ? "is-active" : ""}><span><History /></span><div><strong>{versionLabel(item.version_no)}</strong><small>{formatDateTime(item.created_at, locale, timezone)}{item.reviewer_comment ? ` · ${item.reviewer_comment}` : ""}</small></div>{versionId === item.id && <Check />}</button>)}</div>}
      </SectionCard>
      <details className="owner-disclosure"><summary>{copy[locale].ownerFocus.why}</summary>
      <div className="version-technical-records">{versions.map((item) => <p key={item.id}>{versionLabel(item.version_no)} · {stateLabel(item.approval_state, locale)} · {item.author_type === "agent" ? ac.history.agent : ac.history.member}</p>)}</div>
      <SectionCard><div className="section-card-heading"><div><p className="eyebrow">{ac.history.safetyEyebrow}</p><h2>{ac.history.safetyTitle}</h2></div></div>
        {conflict ? <div className="conflict-state" role="alert"><ShieldAlert /><div><strong>{ac.editor.conflictTitle}</strong><p>{ac.editor.conflictBody}</p><Button size="sm" onClick={loadLatest}><RefreshCw /> {ac.editor.loadLatest}</Button></div></div> : <div className="idempotent-state"><CheckCircle2 /><div><strong>{ac.history.noConflict}</strong><p>{ac.history.idempotent}</p></div></div>}
        <div className="audit-mini">{relatedAudit.length === 0 ? <div><span>—</span><p>{ac.history.noAudit}</p></div> : relatedAudit.map((row) => <div key={row.id}><span>{formatDateTime(row.created_at, locale, timezone)}</span><p><strong>{auditEventLabel(row.event, locale)}</strong> · {auditActorLabel(row.actor_type, locale)}{typeof row.payload?.version_no === "number" ? ` · ${versionLabel(row.payload.version_no)}` : ""}</p></div>)}</div>
      </SectionCard></details>
    </div>
  )
}
