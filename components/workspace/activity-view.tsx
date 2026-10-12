import type { ReactNode } from "react"

import { PageIntro, SectionCard } from "@/components/product-ui"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { formatDateTime } from "@/lib/workspace/format"
import { activityActorLabel, auditEntityLabel, auditEventLabel } from "@/lib/workspace/audit-labels"
import type { AuditEventRow } from "@/lib/workspace/queries-pages"

type DetailLocale = PrototypeLocale

const RIGHTS: Record<string, { en: string; zh: string }> = {
  approved: { en: "Rights approved", zh: "權利已核准" },
  needs_review: { en: "Rights need review", zh: "權利待審核" },
  rejected: { en: "Rights rejected", zh: "權利已拒絕" },
}
const MODES: Record<string, { en: string; zh: string }> = {
  export: { en: "Exported", zh: "匯出" },
  copy: { en: "Copied", zh: "複製" },
  publish: { en: "Published", zh: "發佈" },
}
const PROVIDERS: Record<string, { en: string; zh: string }> = {
  google_gbp: { en: "Google Business Profile", zh: "Google 商戶檔案" },
  instagram: { en: "Instagram", zh: "Instagram" },
  ga4: { en: "Google Analytics", zh: "Google Analytics" },
}

/**
 * Only payload fields an owner can read. This used to print every primitive
 * key as "key value", which put the request fingerprint (`ip_hash`), row ids
 * and byte counts in the Detail column as raw codes.
 */
function detail(row: AuditEventRow, locale: DetailLocale): string {
  const isChinese = locale !== "en"
  const pick = (label: { en: string; zh: string } | undefined) => (label ? (isChinese ? label.zh : label.en) : null)
  const payload = row.payload ?? {}
  const parts: string[] = []
  const number = (key: string) => (typeof payload[key] === "number" && Number.isFinite(payload[key]) ? (payload[key] as number) : null)
  const text = (key: string) => (typeof payload[key] === "string" && payload[key] ? (payload[key] as string) : null)

  const version = number("version_no")
  if (version !== null) parts.push(isChinese ? `第 ${version} 版` : `Version ${version}`)
  const template = text("template_key")
  const templates = copy[locale].workspace.templates as Record<string, { title: string } | undefined>
  if (template && templates[template]) parts.push(templates[template]!.title)
  const mode = pick(MODES[text("mode") ?? ""])
  if (mode) parts.push(mode)
  const provider = pick(PROVIDERS[text("provider") ?? text("integration") ?? ""])
  if (provider) parts.push(provider)
  const filename = text("filename")
  if (filename) parts.push(filename)
  const rights = pick(RIGHTS[text("rights_status") ?? ""])
  if (rights) parts.push(rights)
  const revision = number("revision")
  if (revision !== null) parts.push(isChinese ? `第 ${revision} 次修訂` : `Revision ${revision}`)
  const cancelled = number("cancelled_actions")
  if (cancelled) parts.push(isChinese ? `已取消 ${cancelled} 項行動` : `${cancelled} ${cancelled === 1 ? "action" : "actions"} cancelled`)

  if (parts.length === 0) {
    const entity = auditEntityLabel(row.entity_type, isChinese)
    if (entity) parts.push(entity)
  }
  return parts.join(" · ")
}

export function ActivityView({ locale, timezone, events, problems }: { locale: PrototypeLocale; timezone: string; events: AuditEventRow[]; problems?: ReactNode }) {
  const isChinese = locale !== "en"
  return (
    <div className="activity-page">
      <PageIntro eyebrow={isChinese ? "只增不改的店主審計紀錄" : "Append-only owner audit"} title={isChinese ? "活動紀錄" : "Activity"} description={isChinese ? "記錄來源、版本、角色、審批及交付；最新事件在上，原始內容不會藏在分析事件內。" : "Source, version, role, approval and delivery events are recorded latest-first without putting raw content in analytics."} />
      {problems}
      <SectionCard className="activity-card">
        <Table className="activity-table">
          <TableCaption>{isChinese ? "工作台事件，按時間由新至舊排列" : "Workspace events, latest first"}</TableCaption>
          <TableHeader><TableRow><TableHead>{isChinese ? "時間" : "Time"}</TableHead><TableHead>{isChinese ? "操作人" : "Actor"}</TableHead><TableHead>{isChinese ? "事件" : "Event"}</TableHead><TableHead>{isChinese ? "詳情" : "Detail"}</TableHead></TableRow></TableHeader>
          <TableBody>
            {events.length === 0 && <TableRow><TableCell colSpan={4}>{isChinese ? "尚未有事件。" : "No events yet."}</TableCell></TableRow>}
            {events.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{formatDateTime(row.created_at, locale, timezone)}</TableCell>
                <TableCell>{activityActorLabel(row, isChinese)}</TableCell>
                <TableCell>{auditEventLabel(row.event, locale)}</TableCell>
                <TableCell>{detail(row, locale)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  )
}
