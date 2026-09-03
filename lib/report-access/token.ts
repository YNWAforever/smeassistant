import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const VIEWER_GRANT_COOKIE = "sme_report_grant";

export const secureViewerCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

export interface ViewerTokenGrant {
  rawToken: string;
  tokenHash: string;
}

/** Token parsed from the viewer grant cookie, bound to a persisted grant id. */
export interface PresentedViewerToken {
  grantId: string;
  rawToken: string;
}

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{43}$/;
const DEVELOPMENT_TOKEN_SECRET = "sme-scanner-development-secret";
const MIN_PRODUCTION_SECRET_BYTES = 32;

function reportAccessTokenSecret(): string {
  const configured = process.env.REPORT_ACCESS_TOKEN_SECRET?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!configured || Buffer.byteLength(configured, "utf8") < MIN_PRODUCTION_SECRET_BYTES) {
      throw new Error("REPORT_ACCESS_TOKEN_SECRET must be at least 32 bytes in production");
    }
    return configured;
  }
  return configured || DEVELOPMENT_TOKEN_SECRET;
}

/** Generate the 32-byte opaque key a client should reuse for retries. */
export function createIdempotencyKey(): string {
  return randomBytes(32).toString("base64url");
}

export function isValidIdempotencyKey(value: string): boolean {
  if (!IDEMPOTENCY_KEY_RE.test(value)) return false;
  try {
    return Buffer.from(value, "base64url").length === 32;
  } catch {
    return false;
  }
}

/**
 * Derive a stable viewer token from a retry key without persisting plaintext.
 * The server secret prevents a database reader who sees the idempotency key
 * from deriving the viewer token; only the SHA-256 token hash is persisted.
 */
export function createViewerTokenFromIdempotencyKey(idempotencyKey: string): ViewerTokenGrant {
  if (!isValidIdempotencyKey(idempotencyKey)) throw new Error("invalid idempotency key");
  const secret = reportAccessTokenSecret();
  const rawToken = createHmac("sha256", secret)
    .update(Buffer.from(idempotencyKey, "base64url"))
    .digest("base64url");
  return { rawToken, tokenHash: hashViewerToken(rawToken) };
}

/** Create the one-time plaintext token returned only to the unlock route. */
export function createViewerToken(): ViewerTokenGrant {
  const rawToken = randomBytes(32).toString("base64url");
  return { rawToken, tokenHash: hashViewerToken(rawToken) };
}

export function hashViewerToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/**
 * Compare a presented token to the stored SHA-256 hash without leaking an
 * early-exit comparison. Invalid stored values are rejected before comparing.
 */
export function tokenHashMatches(rawToken: string, storedHash: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(storedHash)) return false;
  const presented = Buffer.from(hashViewerToken(rawToken), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}

export function encodeViewerGrantCookie(grantId: string, rawToken: string): string {
  if (!grantId || !rawToken) throw new Error("viewer grant cookie requires grant id and token");
  return `${grantId}.${rawToken}`;
}

export function parseViewerGrantCookie(
  value: string | undefined | null,
): { grantId: string; rawToken: string } | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [grantId, rawToken] = parts;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(grantId)) return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) return null;
  try {
    if (Buffer.from(rawToken, "base64url").length !== 32) return null;
  } catch {
    return null;
  }
  return { grantId, rawToken };
}
