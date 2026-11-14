import type { VerifiedIdentity } from "./contracts";

/** Validate an upstream session without accepting a signed cache as revocation proof. */
export function verifiedSessionIdentity(value: unknown): VerifiedIdentity | null {
  if (!value || typeof value !== "object") return null;
  const { user, session } = value as { user?: unknown; session?: unknown };
  if (!user || typeof user !== "object" || !session || typeof session !== "object") return null;
  const u = user as Record<string, unknown>;
  const s = session as Record<string, unknown>;
  if (u.emailVerified !== true || typeof u.id !== "string" || !u.id.trim()
    || typeof u.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)
    || s.userId !== u.id) return null;
  const expiry = s.expiresAt;
  const expiresAt = expiry instanceof Date ? expiry.getTime()
    : typeof expiry === "string" ? Date.parse(expiry) : NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return { provider: "neon", subject: u.id, email: u.email, verified: true };
}
