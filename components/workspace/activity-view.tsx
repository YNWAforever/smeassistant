import { PageIntro, SectionCard } from "@/components/product-ui"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { PrototypeLocale } from "@/lib/copy"
import { formatDateTime } from "@/lib/workspace/format"
import { AUDIT_ACTOR_LABELS, AUDIT_EVENT_LABELS } from "@/lib/workspace/audit-labels"
import type { AuditEventRow } from "@/lib/workspace/queries-pages"

function detail(row: AuditEventRow, isChinese: boolean): string {
  const payload = row.payload ?? {}
  const parts: string[] = []
  for (const [key, value] of Object.entries(payload)) {
    if (key === "locale" || value === null || value === undefined || typeof value === "object") continue
    parts.push(`${key} ${String(value)}`)
  }
  if (!parts.length && row.entity_type) parts.push(isChinese ? `${row.entity_type}` : row.entity_type)
  return parts.join(" · ")
}

export function ActivityView({ locale, timezone, events }: { locale: PrototypeLocale; timezone: string; events: AuditEventRow[] }) {
  const isChinese = locale !== "en"
  return (
    <div className="activity-page">
      <PageIntro eyebrow={isChinese ? "只增不改的店主審計紀錄" : "Append-only owner audit"} title={isChinese ? "活動紀錄" : "Activity"} description={isChinese ? "記錄來源、版本、角色、審批及交付；最新事件在上，原始內容不會藏在分析事件內。" : "Source, version, role, approval and delivery events are recorded latest-first without putting raw content in analytics."} />
      <SectionCard>
        <Table>
          <TableCaption>{isChinese ? "工作台事件，按時間由新至舊排列" : "Workspace events, latest first"}</TableCaption>
          <TableHeader><TableRow><TableHead>{isChinese ? "時間" : "Time"}</TableHead><TableHead>{isChinese ? "操作人" : "Actor"}</TableHead><TableHead>{isChinese ? "事件" : "Event"}</TableHead><TableHead>{isChinese ? "詳情" : "Detail"}</TableHead></TableRow></TableHeader>
          <TableBody>
            {events.length === 0 && <TableRow><TableCell colSpan={4}>{isChinese ? "尚未有事件。" : "No events yet."}</TableCell></TableRow>}
            {events.map((row) => {
              const label = AUDIT_EVENT_LABELS[row.event]
              const actor = AUDIT_ACTOR_LABELS[row.actor_type]
              return (
                <TableRow key={row.id}>
                  <TableCell>{formatDateTime(row.created_at, locale, timezone)}</TableCell>
                  <TableCell>{isChinese ? actor.zh : actor.en}</TableCell>
                  <TableCell>{label ? (isChinese ? label.zh : label.en) : row.event}</TableCell>
                  <TableCell>{detail(row, isChinese)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  )
}
