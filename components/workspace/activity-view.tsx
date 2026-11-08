import type { ReactNode } from "react"

import { EmptyState } from "@/components/kinnso/states"
import { PageIntro, SectionCard } from "@/components/product-ui"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { formatDateTime } from "@/lib/workspace/format"
import { activityActorLabel, auditEntityLabel, auditEventLabel } from "@/lib/workspace/audit-labels"
import type { AuditEventRow } from "@/lib/workspace/queries-pages"
import { fill } from "@/lib/copy-ui"

type DetailLocale = PrototypeLocale


/**
 * Only payload fields an owner can read. This used to print every primitive
 * key as "key value", which put the request fingerprint (`ip_hash`), row ids
 * and byte counts in the Detail column as raw codes.
 */
function detail(row: AuditEventRow, locale: DetailLocale): string {
  const pc = copy[locale].workspaceHome.activity
  const pick =(labels: Record<string, string>, key: string) => (Object.hasOwn(labels, key) ? labels[key] : null)
  const payload = row.payload ?? {}
  const parts: string[] = []
  const number = (key: string) => (typeof payload[key] === "number" && Number.isFinite(payload[key]) ? (payload[key] as number) : null)
  const text = (key: string) => (typeof payload[key] === "string" && payload[key] ? (payload[key] as string) : null)

  const version = number("version_no")
  if (version !== null) parts.push(fill(pc.version, { version }))
  const template = text("template_key")
  const templates = copy[locale].workspace.templates as Record<string, { title: string } | undefined>
  if (template && templates[template]) parts.push(templates[template]!.title)
  const mode = pick(pc.modes, text("mode") ?? "")
  if (mode) parts.push(mode)
  const provider = pick(pc.providers, text("provider") ?? text("integration") ?? "")
  if (provider) parts.push(provider)
  const filename = text("filename")
  if (filename) parts.push(filename)
  const rights = pick(pc.rights, text("rights_status") ?? "")
  if (rights) parts.push(rights)
  const revision = number("revision")
  if (revision !== null) parts.push(fill(pc.revision, { revision }))
  const cancelled = number("cancelled_actions")
  if (cancelled) parts.push(fill(cancelled === 1 ? pc.cancelledOne : pc.cancelledMany, { cancelled }))

  if (parts.length === 0) {
    const entity = auditEntityLabel(row.entity_type, locale)
    if (entity) parts.push(entity)
  }
  return parts.join(" · ")
}

export function ActivityView({ locale, timezone, events, problems }: { locale: PrototypeLocale; timezone: string; events: AuditEventRow[]; problems?: ReactNode }) {
  const pc = copy[locale].workspaceHome.activity
  return (
    <div className="activity-page">
      <PageIntro eyebrow={pc.appendOnlyOwnerAudit} title={copy[locale].shell.settings.activity.title} description={pc.sourceVersionRoleApproval} />
      {problems}
      {events.length === 0 ? <EmptyState locale={locale} kind="noData" title={copy[locale].shell.empty.activity.title} body={copy[locale].shell.empty.activity.body} /> : (
      <SectionCard className="activity-card">
        <Table className="activity-table">
          <TableCaption>{pc.workspaceEventsLatestFirst}</TableCaption>
          <TableHeader><TableRow><TableHead>{pc.time}</TableHead><TableHead>{pc.actor}</TableHead><TableHead>{pc.event}</TableHead><TableHead>{pc.detail}</TableHead></TableRow></TableHeader>
          <TableBody>
            {events.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{formatDateTime(row.created_at, locale, timezone)}</TableCell>
                <TableCell>{activityActorLabel(row, locale)}</TableCell>
                <TableCell>{auditEventLabel(row.event, locale)}</TableCell>
                <TableCell>{detail(row, locale)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
      )}
    </div>
  )
}
