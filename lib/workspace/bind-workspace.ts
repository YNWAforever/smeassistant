// Binding a staff-assigned workspace to the account that signs in.
//
// Staff assign a workspace to an email before the merchant has ever signed in
// (see app/api/staff/workspaces/route.ts). This reconciles the two identities
// the first time that email arrives as a verified session.
//
// The write is injected, so this module touches no database and is testable
// without one — matching authorize-workspace.ts and claim-scan.ts.

export type BindOutcome =
  | { kind: "bound"; workspaceId: string }
  | { kind: "none" }
  | { kind: "unavailable" };

export interface BindWorkspaceInput {
  userId: string;
  /** Must already be verified by the caller. */
  verifiedEmail: string | null;
  /** Returns the bound workspace id, or null when nothing matched. */
  bindByEmail: (userId: string, email: string) => Promise<string | null>;
}

export async function bindWorkspaceToUser(input: BindWorkspaceInput): Promise<BindOutcome> {
  const userId = input.userId?.trim();
  const email = input.verifiedEmail?.trim().toLowerCase();
  // No email means nothing to match on. Not an error: it is the ordinary state
  // of a session that has not confirmed an address.
  if (!userId || !email) return { kind: "none" };

  try {
    const workspaceId = await input.bindByEmail(userId, email);
    return workspaceId ? { kind: "bound", workspaceId } : { kind: "none" };
  } catch {
    // Fail closed and quietly: a binding that cannot be confirmed must not be
    // reported as success, and an unassigned user is not an error worth logging.
    return { kind: "unavailable" };
  }
}
