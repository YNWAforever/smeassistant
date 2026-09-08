import "server-only";


import type { SessionUser } from "@/lib/auth";
import { identityProvider } from "@/lib/identity/composition";
import { authDiagnostic } from "@/lib/identity/sign-in-diagnostics";
import { holdsViewerGrant } from "@/lib/identity/claim-viewer-grant";
import type { AuthFlow } from "@/lib/identity/sign-in-flow";
import { resolveApplicationUser } from "@/lib/identity/users";
import { claimsRepository } from "@/lib/repositories/claims";
import { membershipRepository } from "@/lib/repositories/membership";
import { shouldRecordAccessRequest } from "@/lib/workspace/access-request";
import { bindWorkspaceToUser } from "@/lib/workspace/bind-workspace";
import { claimScan, type ClaimOutcome } from "@/lib/workspace/claim-scan";
import {
  attachJobToWorkspace,
  bindPendingMembership,
  createWorkspaceWithOwner,
  findOwnedWorkspace,
} from "@/lib/workspace/callback-queries";

import type { CompletionPorts } from "./complete-sign-in";
import type { AuthStage } from "./sign-in-diagnostics";


async function finishClaim(user: SessionUser, flow: AuthFlow): Promise<string | null> {
  if (!flow.claim) return null;

  // This is a best-effort staff signal only. It does not grant authority and a
  // lookup failure never becomes a no-access result.
  const owner = await findOwnedWorkspace(user.id);
  if (owner.error) throw new Error("workspace lookup failed");
  if (shouldRecordAccessRequest({ hasWorkspace: Boolean(owner.data), slug: flow.claim })) {
    try {
      const job = await claimsRepository.jobBySlug(flow.claim);
      if (job) await claimsRepository.recordAccessRequest(job.id, user.id);
    } catch {
      console.error(authDiagnostic("claim_resolution", crypto.randomUUID()));
    }
  }

  const outcome: ClaimOutcome = await claimScan({
    slug: flow.claim,
    sessionUser: { id: user.id, email: user.email ?? null },
    selfServiceEnabled: process.env.OWNER_SELF_SERVICE_CLAIM === "true",
    lookupJobBySlug: claimsRepository.jobBySlug,
    hasViewerGrant: holdsViewerGrant,
    lookupLeadEmail: claimsRepository.firstLeadEmail,
    findWorkspaceForUser: async (userId) => {
      const result = await findOwnedWorkspace(userId);
      if (result.error) throw new Error("workspace lookup failed");
      return result.data ? { id: result.data.workspaceId } : null;
    },
    createWorkspace: createWorkspaceWithOwner,
    attachJobToWorkspace,
  });
  if (outcome.kind === "unavailable") return null;
  return `/${flow.locale}/owner/onboarding?claim=${encodeURIComponent(flow.claim)}&claimed=${outcome.kind}`;
}

/** Production dependency wiring. Request remains part of the contract for the
 * POST boundary; cookies are read from Next's request-scoped cookie jar. */
export async function createCompletionPorts(_request: Request): Promise<CompletionPorts> {
  const provider = await identityProvider();
  return {
    getIdentity: provider.getIdentity.bind(provider),
    mapIdentity: resolveApplicationUser,
    bindInvitations: async (user) => {
      const result = await bindWorkspaceToUser({
        userId: user.id,
        verifiedEmail: user.email ?? null,
        bindByEmail: () => bindPendingMembership(user),
      });
      if (result.kind === "unavailable") throw new Error("invitation binding unavailable");
    },
    hasAcceptedMembership: async (userId) => (await membershipRepository.listAccepted(userId)).length > 0,
    finishClaim,
    clearInvalidSession: async () => {
      const { signOut } = await import("@/lib/auth");
      await signOut();
    },
    reportFailure: (stage: AuthStage, correlationId: string) => console.error(authDiagnostic(stage, correlationId)),
  };
}
