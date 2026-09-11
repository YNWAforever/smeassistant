import "server-only";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getPool } from "@/lib/db/client";

/**
 * Operator identity for the assisted-assignment queue (Phase 2 item 23).
 *
 * Deliberately a NEW module beside lib/auth/staff.ts rather than a change to
 * it. staff.ts is the legacy Fimmick console's identity, which stays in the
 * sme-scanner deployment and fails closed here by design; this is a different
 * trust model with a different allowlist, and merging them would make one
 * variable govern two consoles.
 *
 * app_users has no role column (neon/migrations/0001_identity.sql), so the role
 * lives in configuration, not schema.
 */
export function normalizeOperatorEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Fails closed on an absent, empty or separator-only allowlist, which is the
 * shipped default: OPERATOR_EMAILS is not set in .env.example.
 */
export function isAllowedOperatorEmail(email: string, allowlist = process.env.OPERATOR_EMAILS): boolean {
  const candidate = normalizeOperatorEmail(email ?? "");
  if (!candidate) return false;
  const allowed = (allowlist ?? "")
    .split(/[,;\s]+/)
    .map(normalizeOperatorEmail)
    .filter(Boolean);
  if (allowed.length === 0) return false;
  return allowed.includes(candidate);
}

export interface OperatorIdentity {
  /** app_users.id -- required by the FK on workspace_access_requests.resolved_by_staff_user_id. */
  userId: string;
  email: string;
}

/**
 * Returns the operator, or null. Fails closed at every step: no session, not on
 * the allowlist, allowlist unset, or no app_users row for the address.
 *
 * Being an operator grants nothing else. It is not a membership: an operator
 * cannot open /owner/* and holds no workspace role.
 */
export async function resolveOperator(): Promise<OperatorIdentity | null> {
  const user = await getUser();
  if (!user?.email) return null;
  const email = normalizeOperatorEmail(user.email);
  if (!isAllowedOperatorEmail(email)) return null;
  const row = (
    await getPool().query<{ id: string }>("SELECT id FROM app_users WHERE lower(email)=$1 LIMIT 1", [email])
  ).rows[0];
  return row ? { userId: row.id, email } : null;
}

/**
 * Page guard. 404 rather than a redirect to sign-in: the operator surface is
 * unlisted, and a redirect would confirm the route exists to anyone guessing
 * the URL.
 */
export async function requireOperator(): Promise<OperatorIdentity> {
  const operator = await resolveOperator();
  if (!operator) notFound();
  return operator;
}
