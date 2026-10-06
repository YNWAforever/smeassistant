import { createHash } from "node:crypto";

export interface ActionListKey { score: number; updatedAt: string; id: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function actionListFingerprint(scope: unknown): string {
  return createHash("sha256").update(JSON.stringify(scope)).digest("hex");
}
export function actionPageSize(value: unknown = 25): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 50) throw new Error("invalid_action_page_size");
  return value;
}
export function encodeActionCursor(key: ActionListKey, fingerprint: string): string {
  return Buffer.from(JSON.stringify({ v: 1, fingerprint, ...key })).toString("base64url");
}
export function decodeActionCursor(value: string | undefined, fingerprint: string): ActionListKey | null {
  if (value === undefined) return null;
  try {
    if (!value || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const raw = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (raw.v !== 1 || raw.fingerprint !== fingerprint || !Number.isFinite(raw.score) || typeof raw.updatedAt !== "string" || !Number.isFinite(Date.parse(raw.updatedAt)) || !UUID.test(raw.id)) throw new Error();
    // Preserve PostgreSQL's exact timestamp string, including microseconds.
    return { score: raw.score, updatedAt: raw.updatedAt, id: raw.id };
  } catch { throw new Error("invalid_action_cursor"); }
}
