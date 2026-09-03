import { PageIntro, SectionCard } from "@/components/product-ui"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { PrototypeLocale } from "@/lib/copy"
import { formatDateTime } from "@/lib/workspace/format"
import type { AuditEventRow } from "@/lib/workspace/queries-pages"

const EVENT_LABELS: Record<string, { en: string; zh: string }> = {
  "scan.queued": { en: "Scan queued", zh: "掃描已排隊" },
  "scan.completed": { en: "Scan completed", zh: "掃描已完成" },
  "scan.failed": { en: "Scan failed", zh: "掃描失敗" },
  "snapshot.created": { en: "Snapshot recorded", zh: "快照已記錄" },
  "action.derived": { en: "Actions prioritised", zh: "行動已排定優先次序" },
  "action.updated": { en: "Action updated", zh: "行動已更新" },
  "action.dismissed": { en: "Action dismissed", zh: "行動已略過" },
  "run.started": { en: "Draft generation started", zh: "草稿生成已開始" },
  "run.succeeded": { en: "Draft prepared", zh: "草稿已準備" },
  "run.failed": { en: "Draft generation failed", zh: "草稿生成失敗" },
  "version.created": { en: "Version saved", zh: "已儲存新版本" },
  "version.approved": { en: "Version approved", zh: "版本已核准" },
  "version.changes_requested": { en: "Changes requested", zh: "已要求修改" },
  "version.rejected": { en: "Version rejected", zh: "版本已拒絕" },
  "delivery.exported": { en: "Export recorded", zh: "已記錄匯出" },
  "delivery.copied": { en: "Copy recorded", zh: "已記錄複製" },
  "workspace.claimed": { en: "Workspace claimed", zh: "工作台已認領" },
  "member.invited": { en: "Member invited", zh: "已邀請成員" },
  "member.role_changed": { en: "Member role changed", zh: "成員角色已更改" },
  "integration.updated": { en: "Integration updated", zh: "連接已更新" },
  "brand.updated": { en: "Brand profile updated", zh: "品牌資料已更新" },
  "asset.uploaded": { en: "Asset uploaded", zh: "素材已上載" },
  "asset.rights_confirmed": { en: "Asset rights confirmed", zh: "素材權利已確認" },
  "assistant.run": { en: "Operator answered", zh: "助理已回應" },
  "consent.public_evidence": { en: "Public evidence consent", zh: "公開證據同意" },
}

const ACTOR_LABELS: Record<AuditEventRow["actor_type"], { en: string; zh: string }> = {
  user: { en: "Member", zh: "成員" },
  agent: { en: "Visibility Workspace", zh: "能見度工作台" },
  system: { en: "Visibility Workspace", zh: "能見度工作台" },
  scanner: { en: "Scanner", zh: "掃描器" },
}

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
              const label = EVENT_LABELS[row.event]
              const actor = ACTOR_LABELS[row.actor_type]
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
