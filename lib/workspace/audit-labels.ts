/**
 * Display labels for audit_events rows (CLAUDE.md §3.11), shared by the
 * Activity page and the action detail history tab. Plain data, safe to import
 * from client components.
 */
export const AUDIT_EVENT_LABELS: Record<string, { en: string; zh: string }> = {
  "scan.queued": { en: "Scan queued", zh: "掃描已排隊" },
  "scan.completed": { en: "Scan completed", zh: "掃描已完成" },
  "scan.failed": { en: "Scan failed", zh: "掃描失敗" },
  "snapshot.created": { en: "Snapshot recorded", zh: "快照已記錄" },
  "action.derived": { en: "Actions prioritised", zh: "行動已排定優先次序" },
  "action.updated": { en: "Action updated", zh: "行動已更新" },
  "action.dismissed": { en: "Action dismissed", zh: "行動已略過" },
  "action.applied": { en: "Marked as applied", zh: "標記為已套用" },
  "action.verified": { en: "Confirmed on the website", zh: "已在網站確認" },
  "action.application_retracted": { en: "Applied mark withdrawn", zh: "撤回已套用標記" },
  "run.started": { en: "Draft generation started", zh: "草稿生成已開始" },
  "run.succeeded": { en: "Draft prepared", zh: "草稿已準備" },
  "run.failed": { en: "Draft generation failed", zh: "草稿生成失敗" },
  "run.timed_out": { en: "Draft generation timed out", zh: "草稿生成逾時" },
  "version.created": { en: "Version saved", zh: "已儲存新版本" },
  "version.approved": { en: "Version approved", zh: "版本已核准" },
  "version.changes_requested": { en: "Changes requested", zh: "已要求修改" },
  "version.rejected": { en: "Version rejected", zh: "版本已拒絕" },
  "delivery.exported": { en: "Export recorded", zh: "已記錄匯出" },
  "delivery.copied": { en: "Copy recorded", zh: "已記錄複製" },
  "workspace.claimed": { en: "Workspace claimed", zh: "工作台已認領" },
  "member.invited": { en: "Member invited", zh: "已邀請成員" },
  "member.invitation_resent": { en: "Invitation resent", zh: "已重新發送邀請" },
  "member.role_changed": { en: "Member role changed", zh: "成員角色已更改" },
  "report.recovery_requested": { en: "Report link requested", zh: "已要求報告連結" },
  "report.recovery_redeemed": { en: "Report link used", zh: "已使用報告連結" },
  "integration.updated": { en: "Integration updated", zh: "連接已更新" },
  "brand.updated": { en: "Brand profile updated", zh: "品牌資料已更新" },
  "asset.uploaded": { en: "Asset uploaded", zh: "素材已上載" },
  "asset.rights_confirmed": { en: "Asset rights confirmed", zh: "素材權利已確認" },
  "assistant.run": { en: "Operator answered", zh: "助理已回應" },
  "consent.public_evidence": { en: "Public evidence consent", zh: "公開證據同意" },
  "fix_pack.reviewed": { en: "Fix Pack draft reviewed", zh: "Fix Pack 草稿已審閱" },
  "access_request.submitted": { en: "Access request submitted", zh: "已提交存取申請" },
  "access_request.reviewed": { en: "Access request opened by an operator", zh: "營運人員已開啟申請" },
  "access_request.information_requested": { en: "More information requested", zh: "已要求補充資料" },
  "access_request.approved": { en: "Access request approved", zh: "存取申請已批准" },
  "access_request.rejected": { en: "Access request rejected", zh: "存取申請已拒絕" },
  // Distinct from workspace.claimed, which is the Google-attested path. Merging
  // them would make the ledger unable to tell an attested claim from an
  // operator assignment.
  "workspace.assigned": { en: "Workspace assigned by an operator", zh: "營運人員已指派工作台" },
  "mail.attempted": { en: "Email attempted", zh: "已嘗試發送電郵" },
  "scan.auto_closed": { en: "Stuck scan closed", zh: "已結束停止回應的掃描" },
  "ops.scan.released": { en: "Scan resumed by Fimmick", zh: "Fimmick 已恢復掃描" },
  "offer.created": { en: "Offer created", zh: "已建立優惠" },
  "offer.updated": { en: "Offer edited", zh: "優惠已修改" },
  // Written by confirm_offer / archive_offer in SQL.
  "offer.confirmed": { en: "Offer confirmed", zh: "優惠已確認" },
  "offer.archived": { en: "Offer archived", zh: "優惠已封存" },
  "pack.started": { en: "Starter pack started", zh: "已開始入門套裝" },
};

export const AUDIT_ACTOR_LABELS: Record<"user" | "agent" | "system" | "scanner", { en: string; zh: string }> = {
  user: { en: "Member", zh: "成員" },
  agent: { en: "Visibility Workspace", zh: "能見度工作台" },
  system: { en: "Visibility Workspace", zh: "能見度工作台" },
  scanner: { en: "Scanner", zh: "掃描器" },
};

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
const OPERATOR_LABEL = { en: "Operator", zh: "營運人員" };

export function activityActorLabel(row: { event: string; actor_type: keyof typeof AUDIT_ACTOR_LABELS }, isChinese: boolean): string {
  const label = row.actor_type === "user" && OPERATOR_EVENTS.has(row.event)
    ? OPERATOR_LABEL
    : AUDIT_ACTOR_LABELS[row.actor_type] ?? AUDIT_ACTOR_LABELS.system;
  return isChinese ? label.zh : label.en;
}

/** What an event was about, when it has no other detail. Unknown types show nothing, never the raw table name. */
const AUDIT_ENTITY_LABELS: Record<string, { en: string; zh: string }> = {
  audit_job: { en: "Scan", zh: "掃描" },
  action: { en: "Action", zh: "行動" },
  action_run: { en: "Draft run", zh: "草稿生成" },
  agent_run: { en: "Fix Pack draft", zh: "Fix Pack 草稿" },
  output_version: { en: "Version", zh: "版本" },
  delivery: { en: "Delivery", zh: "交付" },
  asset: { en: "Asset", zh: "素材" },
  brand_profile: { en: "Brand profile", zh: "品牌資料" },
  offer: { en: "Offer", zh: "優惠" },
  workspace: { en: "Workspace", zh: "工作台" },
  workspace_member: { en: "Member", zh: "成員" },
  workspace_access_request: { en: "Access request", zh: "存取申請" },
  oauth_connection: { en: "Connection", zh: "連接" },
};

export function auditEntityLabel(entityType: string | null, isChinese: boolean): string | null {
  const label = entityType ? AUDIT_ENTITY_LABELS[entityType] : undefined;
  return label ? (isChinese ? label.zh : label.en) : null;
}

export function auditEventLabel(event: string, isChinese: boolean): string {
  const label = AUDIT_EVENT_LABELS[event];
  return label ? (isChinese ? label.zh : label.en) : event;
}

export function auditActorLabel(actor: keyof typeof AUDIT_ACTOR_LABELS, isChinese: boolean): string {
  const label = AUDIT_ACTOR_LABELS[actor] ?? AUDIT_ACTOR_LABELS.system;
  return isChinese ? label.zh : label.en;
}
