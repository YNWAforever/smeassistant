import type { StaffSessionUser } from "./authorize-report";
import { loadStaffIdentity } from "@/lib/auth/staff";

/**
 * Resolve the signed-in staff user for server-rendered report access.
 *
 * There is no staff console in this app (CLAUDE.md 1.2 "Not reused"), so
 * `loadStaffIdentity` always yields null and this resolves to null. The
 * signature is upstream's so `load-report.ts` stays verbatim.
 */
export async function loadStaffSessionUser(): Promise<StaffSessionUser | null> {
  const staff = await loadStaffIdentity();
  return staff ? { id: staff.userId, email: staff.email } : null;
}
