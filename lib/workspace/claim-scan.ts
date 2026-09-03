// Turning an anonymous scan into owned data.
//
// A share_slug travels in URLs, so knowing one proves nothing. Entitlement is
// either the viewer grant cookie issued at unlock, or the email the owner
// already left as a lead on that job — the second exists because owners
// routinely unlock on a phone and open the magic link on a laptop, where no
// grant cookie exists.
//
// Every lookup is injected. This module performs no database access itself, so
// it is testable without one and cannot widen its own access.

export type ClaimOutcome =
  | { kind: "claimed"; workspaceId: string }
  | { kind: "already_claimed" }
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

export interface CreateWorkspaceInput {
  ownerUserId: string;
  ownerEmail: string;
  businessName: string | null;
  industry: string | null;
  district: string | null;
  market: string | null;
}

export interface ClaimScanInput {
  slug: string;
  sessionUser: { id: string; email: string | null } | null;
  /**
   * Defaults off, and must stay off until an unforgeable ownership proof
   * exists. Both available signals are attacker-writable through the public
   * unlock endpoint, so with this enabled anyone who receives a shared report
   * link can unlock it, claim it, and permanently lock the real merchant out —
   * attachJobToWorkspace writes only where workspace_id is null and nothing
   * here can un-claim. The intended proof is the GBP OAuth connection itself:
   * Google attests that the signed-in user manages that business.
   */
  selfServiceEnabled: boolean;
  lookupJobBySlug: (slug: string) => Promise<JobForClaim | null>;
  hasViewerGrant: (jobId: string) => Promise<boolean>;
  lookupLeadEmail: (jobId: string) => Promise<string | null>;
  findWorkspaceForUser: (userId: string) => Promise<{ id: string } | null>;
  createWorkspace: (input: CreateWorkspaceInput) => Promise<{ id: string }>;
  /** Must write only where workspace_id is null; false means another claim won. */
  attachJobToWorkspace: (jobId: string, workspaceId: string) => Promise<boolean>;
}

function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = a?.trim().toLowerCase();
  const right = b?.trim().toLowerCase();
  return Boolean(left && right && left === right);
}

export async function claimScan(input: ClaimScanInput): Promise<ClaimOutcome> {
  const userId = input.sessionUser?.id?.trim();
  if (!userId) return { kind: "not_entitled" };

  try {
    const job = await input.lookupJobBySlug(input.slug);
    // An unknown slug and an unentitled one return the same answer, so this
    // cannot be used to probe which reports exist.
    if (!job) return { kind: "not_entitled" };

    const existing = await input.findWorkspaceForUser(userId);

    // Re-opening the magic link is idempotent and needs no further checks.
    if (job.workspace_id && job.workspace_id === existing?.id) {
      return { kind: "claimed", workspaceId: job.workspace_id };
    }

    // Entitlement is evaluated BEFORE any answer that depends on whether the
    // job is claimed. Returning already_claimed first made the pair
    // (already_claimed, not_entitled) an oracle for which share slugs exist and
    // have owners.
    if (!input.selfServiceEnabled) return { kind: "requires_verification" };

    // BOTH signals, not either. Neither one proves ownership on its own —
    // report-access/unlock is public and unauthenticated, so anyone holding a
    // slug can mint a viewer grant AND write leads.email with an address they
    // control. Requiring both narrows the window to "attacker unlocked before
    // the real owner did"; it does not close it, which is why the flag above
    // exists and defaults off.
    const [grant, leadEmail] = await Promise.all([
      input.hasViewerGrant(job.id),
      input.lookupLeadEmail(job.id),
    ]);
    if (!grant || !sameEmail(leadEmail, input.sessionUser?.email)) {
      return { kind: "not_entitled" };
    }

    if (job.workspace_id) return { kind: "already_claimed" };

    const workspace =
      existing ??
      (await input.createWorkspace({
        ownerUserId: userId,
        ownerEmail: input.sessionUser?.email ?? "",
        businessName: job.business_name ?? null,
        industry: job.industry ?? null,
        district: job.district ?? null,
        market: job.region ?? null,
      }));

    const attached = await input.attachJobToWorkspace(job.id, workspace.id);
    // The write is conditional on workspace_id still being null, so a false
    // return is a lost race rather than an error — report it as such instead of
    // overwriting the winner.
    if (!attached) return { kind: "already_claimed" };

    return { kind: "claimed", workspaceId: workspace.id };
  } catch {
    // Fail closed. A claim that cannot be verified must never be granted, and
    // the caller gets no provider detail to leak.
    return { kind: "unavailable" };
  }
}
