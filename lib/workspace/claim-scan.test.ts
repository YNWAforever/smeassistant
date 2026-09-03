import { describe, expect, it, vi } from "vitest";
import { claimScan, type ClaimScanInput } from "./claim-scan";

/**
 * Claiming turns an anonymous scan into owned data. The entitlement check is the
 * only thing standing between "the owner keeps their report" and "anyone who
 * learns a share_slug takes someone else's business data" — share slugs travel
 * in URLs, so knowing one proves nothing.
 *
 * Every test here is a security test. They are written before the implementation
 * deliberately.
 */

const USER = { id: "user-1", email: "owner@example.com" };

const JOB = {
  id: "job-1",
  workspace_id: null,
  business_name: "Demo Coffee",
  industry: "Cafe",
  district: "Central",
  region: "hk",
};

function harness(overrides: Partial<ClaimScanInput> = {}): ClaimScanInput {
  return {
    slug: "abc123",
    sessionUser: USER,
    lookupJobBySlug: async () => JOB,
    selfServiceEnabled: true,
    hasViewerGrant: async () => true,
    lookupLeadEmail: async () => USER.email,
    findWorkspaceForUser: async () => null,
    createWorkspace: async () => ({ id: "ws-new" }),
    attachJobToWorkspace: async () => true,
    ...overrides,
  };
}

describe("claimScan", () => {
  it("claims a scan the visitor holds a viewer grant for", async () => {
    await expect(claimScan(harness())).resolves.toEqual({
      kind: "claimed",
      workspaceId: "ws-new",
    });
  });

  it("refuses a slug the visitor holds no grant for and did not leave contact details on", async () => {
    // The central case. Knowing the slug is not authorization.
    await expect(
      claimScan(harness({ hasViewerGrant: async () => false, lookupLeadEmail: async () => null })),
    ).resolves.toEqual({ kind: "not_entitled" });
  });

  it("requires the grant AND the lead email, not either one", async () => {
    // Both signals are writable by anyone holding the slug via the public
    // unlock endpoint, so either-or made this a scan-hijack primitive.
    await expect(
      claimScan(harness({ hasViewerGrant: async () => false })),
    ).resolves.toEqual({ kind: "not_entitled" });
    await expect(
      claimScan(harness({ lookupLeadEmail: async () => null })),
    ).resolves.toEqual({ kind: "not_entitled" });
  });

  it("refuses every claim while self-service is disabled", async () => {
    // The default. Neither available signal proves ownership.
    await expect(
      claimScan(harness({ selfServiceEnabled: false })),
    ).resolves.toEqual({ kind: "requires_verification" });
  });

  it("does not leak claimed-ness to an unentitled caller", async () => {
    // already_claimed vs not_entitled was an oracle for which slugs exist and
    // have owners. An unentitled caller must not be able to tell them apart.
    const claimed = await claimScan(
      harness({
        hasViewerGrant: async () => false,
        lookupJobBySlug: async () => ({ ...JOB, workspace_id: "ws-someone-else" }),
      }),
    );
    const unknown = await claimScan(
      harness({ hasViewerGrant: async () => false, lookupJobBySlug: async () => null }),
    );
    expect(claimed).toEqual(unknown);
  });

  it("refuses when the lead email belongs to someone else", async () => {
    await expect(
      claimScan(
        harness({
          hasViewerGrant: async () => false,
          lookupLeadEmail: async () => "different@example.com",
        }),
      ),
    ).resolves.toEqual({ kind: "not_entitled" });
  });

  it("never steals a job another workspace already claimed", async () => {
    // attachJobToWorkspace writes only where workspace_id is null. A false
    // return means another workspace won the race, and this must not overwrite.
    const attach = vi.fn(async () => false);

    await expect(
      claimScan(harness({ attachJobToWorkspace: attach })),
    ).resolves.toEqual({ kind: "already_claimed" });
    expect(attach).toHaveBeenCalledOnce();
  });

  it("short-circuits a job already attached to another workspace", async () => {
    const attach = vi.fn(async () => true);

    await expect(
      claimScan(
        harness({
          lookupJobBySlug: async () => ({ ...JOB, workspace_id: "ws-someone-else" }),
          attachJobToWorkspace: attach,
        }),
      ),
    ).resolves.toEqual({ kind: "already_claimed" });
    // Not merely the right answer — it must not even attempt the write.
    expect(attach).not.toHaveBeenCalled();
  });

  it("is idempotent when the job already belongs to this owner's workspace", async () => {
    // Re-opening the magic link must not error or create a second workspace.
    await expect(
      claimScan(
        harness({
          lookupJobBySlug: async () => ({ ...JOB, workspace_id: "ws-1" }),
          findWorkspaceForUser: async () => ({ id: "ws-1" }),
        }),
      ),
    ).resolves.toEqual({ kind: "claimed", workspaceId: "ws-1" });
  });

  it("reuses an existing workspace rather than creating a second", async () => {
    const create = vi.fn(async () => ({ id: "ws-should-not-happen" }));

    await expect(
      claimScan(harness({ findWorkspaceForUser: async () => ({ id: "ws-existing" }), createWorkspace: create })),
    ).resolves.toEqual({ kind: "claimed", workspaceId: "ws-existing" });
    expect(create).not.toHaveBeenCalled();
  });

  it("seeds the new workspace from the scan so the owner lands on populated data", async () => {
    const create = vi.fn(async () => ({ id: "ws-new" }));

    await claimScan(harness({ createWorkspace: create }));

    expect(create).toHaveBeenCalledWith({
      ownerUserId: "user-1",
      ownerEmail: "owner@example.com",
      businessName: "Demo Coffee",
      industry: "Cafe",
      district: "Central",
      market: "hk",
    });
  });

  it("refuses an anonymous visitor", async () => {
    await expect(claimScan(harness({ sessionUser: null }))).resolves.toEqual({
      kind: "not_entitled",
    });
  });

  it("does not reveal whether an unknown slug exists", async () => {
    await expect(
      claimScan(harness({ lookupJobBySlug: async () => null })),
    ).resolves.toEqual({ kind: "not_entitled" });
  });

  it("fails closed when a lookup throws", async () => {
    await expect(
      claimScan(
        harness({
          lookupJobBySlug: async () => {
            throw new Error("db down");
          },
        }),
      ),
    ).resolves.toEqual({ kind: "unavailable" });
  });

  it("fails closed when the write throws", async () => {
    await expect(
      claimScan(
        harness({
          attachJobToWorkspace: async () => {
            throw new Error("db down");
          },
        }),
      ),
    ).resolves.toEqual({ kind: "unavailable" });
  });
});
