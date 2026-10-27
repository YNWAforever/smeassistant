import { copy, type PrototypeLocale } from "@/lib/copy";

/**
 * Display labels for audit_events rows (CLAUDE.md §3.11), shared by the
 * Activity page and the action detail history tab. Plain data, safe to import
 * from client components. `zh` is the zh-HK wording; `zhTW` is set only where
 * Taiwan wording differs (copy hygiene: 台灣用語).
 */
export const AUDIT_EVENT_LABELS: Record<string, { en: string; zh: string; zhTW?: string }> = {
  "scan.queued": { en: "Scan queued", zh: "掃描已排隊" },
  "scan.completed": { en: "Scan completed", zh: "掃描已完成" },
  "scan.failed": { en: "Scan failed", zh: "掃描失敗" },
  "snapshot.created": { en: "Scan results saved", zh: "掃描結果已儲存" },
  "action.derived": { en: "To-do list sorted", zh: "待辦已排序" },
  "action.updated": { en: "Action updated", zh: "待辦已更新" },
  "action.dismissed": { en: "Action dismissed", zh: "待辦已略過" },
  "action.applied": { en: "Marked as done", zh: "標記為已完成" },
  "action.owner_review_check_recorded": { en: "Owner review check recorded (statement)", zh: "已記錄店主評論核對（聲明）" },
  "action.verified": { en: "Confirmed on the website", zh: "已在網站確認" },
  "action.verification_checked": { en: "External change checked", zh: "已核對外部變更", zhTW: "已查證外部變更" },
  "action.application_retracted": { en: "Done mark withdrawn", zh: "撤回已完成標記" },
  "run.started": { en: "Draft generation started", zh: "草稿生成已開始" },
  "run.succeeded": { en: "Draft prepared", zh: "草稿已準備" },
  "run.failed": { en: "Draft generation failed", zh: "草稿生成失敗" },
  "run.timed_out": { en: "Draft generation timed out", zh: "草稿生成逾時" },
  "version.created": { en: "Version saved", zh: "已儲存新版本" },
  "version.approved": { en: "Version approved", zh: "版本已確認" },
  "version.changes_requested": { en: "Changes requested", zh: "已要求修改" },
  "version.rejected": { en: "Version rejected", zh: "版本已拒絕" },
  "delivery.exported": { en: "Export recorded", zh: "已記錄匯出" },
  "action.copy_follow_up_recorded": { en: "Copy follow-up recorded", zh: "已記錄複製後回覆" },
  "delivery.copied": { en: "Copy recorded", zh: "已記錄複製" },
  "workspace.claimed": { en: "Workspace claimed", zh: "工作台已認領" },
  "member.invited": { en: "Member invited", zh: "已邀請成員" },
  "member.invitation_resent": { en: "Invitation resent", zh: "已重新發送邀請" },
  "member.role_changed": { en: "Member role changed", zh: "成員角色已更改" },
  "report.recovery_requested": { en: "Report link requested", zh: "已要求報告連結" },
  "report.recovery_redeemed": { en: "Report link used", zh: "已使用報告連結" },
  "integration.updated": { en: "Integration updated", zh: "連接已更新" },
  "brand.updated": { en: "Brand profile updated", zh: "品牌資料已更新" },
  "asset.uploaded": { en: "Asset uploaded", zh: "相片已上載", zhTW: "照片已上傳" },
  "asset.rights_confirmed": { en: "Asset rights confirmed", zh: "相片使用權已確認", zhTW: "照片使用權已確認" },
  "assistant.run": { en: "Operator answered", zh: "助理已回應" },
  "consent.public_evidence": { en: "Public evidence consent", zh: "公開證據同意" },
  "fix_pack.reviewed": { en: "Fimmick draft reviewed", zh: "已處理 Fimmick 嘅稿", zhTW: "已處理 Fimmick 準備的稿" },
  "access_request.submitted": { en: "Access request submitted", zh: "已提交存取申請" },
  "access_request.reviewed": { en: "Access request opened by an operator", zh: "營運人員已開啟申請" },
  "access_request.information_requested": { en: "More information requested", zh: "已要求補充資料" },
  "access_request.approved": { en: "Access request approved", zh: "存取申請已確認" },
  "access_request.rejected": { en: "Access request rejected", zh: "存取申請已拒絕" },
  // Distinct from workspace.claimed, which is the Google-attested path. Merging
  // them would make the ledger unable to tell an attested claim from an
  // operator assignment.
  "workspace.assigned": { en: "Workspace assigned by an operator", zh: "營運人員已指派工作台" },
  "mail.attempted": { en: "Email attempted", zh: "已嘗試發送電郵", zhTW: "已嘗試發送電子郵件" },
  "scan.auto_closed": { en: "Stuck scan closed", zh: "已結束停止回應的掃描" },
  "ops.scan.released": { en: "Scan resumed by Fimmick", zh: "Fimmick 已恢復掃描" },
  "offer.created": { en: "Offer created", zh: "已建立優惠" },
  "offer.updated": { en: "Offer edited", zh: "優惠已修改" },
  // Written by confirm_offer / archive_offer in SQL.
  "offer.confirmed": { en: "Offer confirmed", zh: "優惠已確認" },
  "offer.archived": { en: "Offer archived", zh: "優惠已封存" },
  "pack.started": { en: "Starter pack started", zh: "已開始入門套裝", zhTW: "已開始入門套組" },
};

type AuditActor = "user" | "agent" | "system" | "scanner";

/**
 * Events only an allowlisted operator writes. They are stored with actor_type
 * 'user' (the operator's own account), so without this the ledger would show an
 * operator's assignment as something a workspace member did (F-22).
 */
const OPERATOR_EVENTS = new Set([
  "workspace.assigned",
  "access_request.reviewed",
  "access_request.information_requested",
  "access_request.approved",
  "access_request.rejected",
  "ops.scan.released",
]);
export function activityActorLabel(row: { event: string; actor_type: AuditActor }, locale: PrototypeLocale): string {
  const actors = copy[locale].workspaceLabels.actors;
  return row.actor_type === "user" && OPERATOR_EVENTS.has(row.event) ? actors.operator : actors[row.actor_type] ?? actors.system;
}

/** What an event was about, when it has no other detail. Unknown types show nothing, never the raw table name. */
export function auditEntityLabel(entityType: string | null, locale: PrototypeLocale): string | null {
  const entities: Record<string, string> = copy[locale].workspaceLabels.entities;
  return entityType && Object.hasOwn(entities, entityType) ? entities[entityType] : null;
}

export function auditEventLabel(event: string, locale: "en" | "zh-HK" | "zh-TW"): string {
  const label = AUDIT_EVENT_LABELS[event];
  if (!label) return event;
  if (locale === "en") return label.en;
  return locale === "zh-TW" ? label.zhTW ?? label.zh : label.zh;
}

export function auditActorLabel(actor: AuditActor, locale: PrototypeLocale): string {
  const actors = copy[locale].workspaceLabels.actors;
  return actors[actor] ?? actors.system;
}
