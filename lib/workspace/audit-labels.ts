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
};

export const AUDIT_ACTOR_LABELS: Record<"user" | "agent" | "system" | "scanner", { en: string; zh: string }> = {
  user: { en: "Member", zh: "成員" },
  agent: { en: "Visibility Workspace", zh: "能見度工作台" },
  system: { en: "Visibility Workspace", zh: "能見度工作台" },
  scanner: { en: "Scanner", zh: "掃描器" },
};

export function auditEventLabel(event: string, isChinese: boolean): string {
  const label = AUDIT_EVENT_LABELS[event];
  return label ? (isChinese ? label.zh : label.en) : event;
}

export function auditActorLabel(actor: keyof typeof AUDIT_ACTOR_LABELS, isChinese: boolean): string {
  const label = AUDIT_ACTOR_LABELS[actor] ?? AUDIT_ACTOR_LABELS.system;
  return isChinese ? label.zh : label.en;
}
