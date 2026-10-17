export type ActionAuditScope = {
  entity_id: string | null;
  payload: unknown;
};

export function auditBelongsToAction(
  row: ActionAuditScope,
  input: { actionId: string; entityIds: Set<string> },
): boolean {
  if (row.entity_id !== null && input.entityIds.has(row.entity_id)) return true;
  if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) return false;
  const payload = row.payload as Record<string, unknown>;
  return payload.action_id === input.actionId
    && typeof payload.version_id === "string"
    && input.entityIds.has(payload.version_id);
}
