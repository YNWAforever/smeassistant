/**
 * Staff identity stub.
 *
 * The Fimmick staff console stays in the legacy sme-scanner deployment
 * (CLAUDE.md 1.2 "Not reused", D12). This app therefore never grants staff
 * access to anything: `isAllowedStaffEmail` fails closed regardless of
 * `FIMMICK_STAFF_EMAILS`, and `loadStaffIdentity` never finds a session. The
 * exports exist so the ported report-access layer compiles unchanged and so a
 * later phase can wire a real allowlist behind the same names.
 */
export interface StaffIdentity {
  userId: string;
  email: string;
}

export function normalizeStaffEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Always false: there is no staff allowlist in this app (fail closed). */
export function isAllowedStaffEmail(_email: string, _allowlist?: string): boolean {
  return false;
}

/** Always null: no staff session can be established in this app. */
export async function loadStaffIdentity(): Promise<StaffIdentity | null> {
  return null;
}
