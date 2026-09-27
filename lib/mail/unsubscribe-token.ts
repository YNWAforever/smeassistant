// Signed, stateless unsubscribe links for event mail (docs/superpowers/specs/
// 2026-09-27-mail-outbox-design.md). A GET on the unsubscribe route only
// ever reads this token -- it never mutates -- so the token itself has to
// carry everything needed to flip the member's switch later and to expire
// on its own; there is no server-side row to revoke it early.
//
// Format: <base64url(JSON payload)>.<base64url(HMAC-SHA256 of that segment)>.
// Mirrors lib/report-access/token.ts's HMAC + timingSafeEqual idiom; unlike
// lib/security/token-crypto.ts this is authentication only, not encryption --
// the payload (a user id, a workspace id, a mail kind, an expiry) is not a
// secret, so it is base64url-encoded rather than sealed.
import { createHmac, timingSafeEqual } from "node:crypto";

import { MAIL_KINDS, type MailKind } from "./decide";

export const UNSUBSCRIBE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const MIN_SECRET_BYTES = 32;

/**
 * The same floor lib/mail/availability.ts requires before mail can send, read
 * independently here: a member must be able to leave a mailing even while
 * sending itself is closed for an unrelated reason (mail_unapproved, a
 * missing RESEND_API_KEY, ...), but a secret that is missing or too short
 * cannot safely verify anything, so callers refuse rather than accept an
 * unverifiable token. Returns the trimmed secret, or null when it is unusable.
 */
export function resolveUnsubscribeSecret(env: Record<string, string | undefined> = process.env): string | null {
  const trimmed = env.MAIL_UNSUBSCRIBE_SECRET?.trim();
  if (!trimmed || Buffer.byteLength(trimmed, "utf8") < MIN_SECRET_BYTES) return null;
  return trimmed;
}

export interface UnsubscribePayload {
  userId: string;
  workspaceId: string;
  kind: MailKind;
  /** Epoch milliseconds. */
  expiresAt: number;
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function signUnsubscribeToken(payload: UnsubscribePayload, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

function isUnsubscribePayload(value: unknown): value is UnsubscribePayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.userId === "string" &&
    typeof candidate.workspaceId === "string" &&
    typeof candidate.expiresAt === "number" &&
    typeof candidate.kind === "string" &&
    (MAIL_KINDS as readonly string[]).includes(candidate.kind)
  );
}

/**
 * Verifies signature, shape and expiry, in that order. Returns null on any
 * failure (malformed, tampered, wrong secret, unknown kind, expired) rather
 * than throwing: an unsubscribe route treats every failure identically, as
 * a neutral "this link is no longer valid" response.
 */
export function verifyUnsubscribeToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): UnsubscribePayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, providedSignature] = parts as [string, string];

  const expectedSignature = sign(encodedPayload, secret);
  const provided = Buffer.from(providedSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!isUnsubscribePayload(parsed)) return null;
  if (parsed.expiresAt <= now) return null;
  return parsed;
}
