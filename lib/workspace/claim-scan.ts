// Resume ownership that Google verification or staff assignment already established.
// Report links, viewer grants and lead email addresses never prove ownership.

export type ClaimOutcome =
  | { kind: "claimed"; workspaceId: string }
  | { kind: "not_entitled" }
  | { kind: "requires_verification" }
  | { kind: "unavailable" };

export interface JobForClaim {
  id: string;
  workspace_id: string | null;
  business_name?: string | null;
  industry?: string | null;
  district?: string | null;
  region?: string | null;
}

export interface ClaimScanInput {
  slug: string;
  sessionUser: { id: string; email: string | null } | null;
  lookupJobBySlug: (slug: string) => Promise<JobForClaim | null>;
  findWorkspaceForUser: (userId: string) => Promise<{ id: string } | null>;
}

/**
 * Read-only continuation after sign-in. There is deliberately no runtime
 * switch or mutation dependency: public unlock data is attacker-writable, so
 * even a mistakenly enabled legacy flag cannot turn it into ownership proof.
 * New ownership stays in the Google-verified or staff-assigned paths.
 */
export async function claimScan(input: ClaimScanInput): Promise<ClaimOutcome> {
  const userId = input.sessionUser?.id?.trim();
  if (!userId) return { kind: "not_entitled" };

  try {
    const job = await input.lookupJobBySlug(input.slug);
    if (!job) return { kind: "not_entitled" };

    const existing = await input.findWorkspaceForUser(userId);
    if (job.workspace_id && job.workspace_id === existing?.id) {
      return { kind: "claimed", workspaceId: job.workspace_id };
    }
    return { kind: "requires_verification" };
  } catch {
    return { kind: "unavailable" };
  }
}
