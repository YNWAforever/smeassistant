export const ASSIGNMENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface AssignmentPatch { assignee_user_id?: string | null; due_at?: string | null }
export interface BulkActionItem { actionId: string; expectedUpdatedAt: string }
export interface BulkActionUpdate { mode: "preview" | "apply"; items: BulkActionItem[]; patch: AssignmentPatch }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Explicit ISO timestamp, real calendar date, timezone and up to PostgreSQL microseconds. */
export function assignmentTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m) return false;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) return false;
  if (m[7] !== "Z" && (Number(m[7].slice(1, 3)) > 14 || Number(m[7].slice(4)) > 59 || (Number(m[7].slice(1, 3)) === 14 && Number(m[7].slice(4)) !== 0))) return false;
  return Number.isFinite(Date.parse(value));
}
export function parseAssignmentPatch(value: unknown): AssignmentPatch {
  if (!record(value) || !Object.keys(value).length || Object.keys(value).some(k => !["assignee_user_id", "due_at"].includes(k))
    || ("assignee_user_id" in value && value.assignee_user_id !== null && (typeof value.assignee_user_id !== "string" || !ASSIGNMENT_UUID.test(value.assignee_user_id)))
    || ("due_at" in value && value.due_at !== null && !assignmentTimestamp(value.due_at))) throw new Error("invalid_assignment_patch");
  return value as AssignmentPatch;
}
export function parseBulkActionUpdate(value: unknown): BulkActionUpdate {
  try {
    if (!record(value) || Object.keys(value).some(k => !["mode", "items", "patch"].includes(k)) || !["preview", "apply"].includes(value.mode as string)
      || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 50) throw new Error();
    const items = value.items as unknown[];
    if (items.some(i => !record(i) || Object.keys(i).some(k => !["actionId", "expectedUpdatedAt"].includes(k)) || typeof i.actionId !== "string" || !ASSIGNMENT_UUID.test(i.actionId) || !assignmentTimestamp(i.expectedUpdatedAt))) throw new Error();
    const ids = items.map(i => (i as BulkActionItem).actionId.toLowerCase());
    if (new Set(ids).size !== ids.length) throw new Error();
    return { mode: value.mode as BulkActionUpdate["mode"], items: items as BulkActionItem[], patch: parseAssignmentPatch(value.patch) };
  } catch { throw new Error("invalid_bulk_request"); }
}
