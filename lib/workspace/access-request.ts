/**
 * A merchant asking Fimmick for access to the report they signed in from.
 *
 * Pure decision plus an injected write, matching authorize-workspace.ts,
 * bind-workspace.ts and claim-scan.ts: this module touches no database and so
 * cannot widen its own reach.
 */

export interface AccessRequestDecisionInput {
  /**
   * Whether the signed-in user owns a workspace, read from `workspace_members`
   * (role='owner', accepted) via findOwnedWorkspace. NOT derived from
   * BindOutcome — `bindPendingMembership` matches zero rows for an
   * already-bound owner, so the bind outcome says "none" on every later
   * sign-in and would file a request each time.
   */
  hasWorkspace: boolean;
  /** The `claim` slug carried through the magic link. */
  slug: string | null;
}

export function shouldRecordAccessRequest({
  hasWorkspace,
  slug,
}: AccessRequestDecisionInput): boolean {
  if (hasWorkspace) return false;
  // A request that does not name a report is not actionable: staff assign a
  // workspace to a specific scan.
  return typeof slug === "string" && slug.trim().length > 0;
}

export interface AccessRequestRecord {
  jobId: string;
  userId: string;
}

export interface AccessRequestDeps {
  insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
}

/**
 * Throws on failure. The caller decides what that means — and for the owner
 * callback it means log and continue, the opposite of lead-access-log.ts, which
 * throws so that an unrecordable disclosure does not happen. Nothing is
 * disclosed here; a merchant who authenticated must not see an error because a
 * BD signal did not persist.
 */
export async function recordAccessRequest(
  record: AccessRequestRecord,
  deps: AccessRequestDeps,
): Promise<void> {
  const { error } = await deps.insert({ job_id: record.jobId, user_id: record.userId });
  if (error) throw new Error("Failed to record workspace access request");
}
