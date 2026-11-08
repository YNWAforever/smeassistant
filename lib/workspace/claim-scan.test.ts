import { describe, expect, it, vi } from "vitest";
import { claimScan, type ClaimScanInput } from "./claim-scan";

const USER = { id: "user-1", email: "owner@example.com" };
const JOB = { id: "job-1", workspace_id: null };

function harness(overrides: Partial<ClaimScanInput> = {}): ClaimScanInput {
  return {
    slug: "shared-report",
    sessionUser: USER,
    lookupJobBySlug: async () => JOB,
    findWorkspaceForUser: async () => null,
    ...overrides,
  };
}

describe("claimScan", () => {
  it("never creates ownership from an enabled legacy switch and attacker-writable report signals", async () => {
    const create = vi.fn(async () => ({ id: "attacker-workspace" }));
    const attach = vi.fn(async () => true);
    // A legacy caller may still pass these fields at runtime; they confer no authority.
    const input = {
      ...harness(), selfServiceEnabled: true,
      hasViewerGrant: async () => true, lookupLeadEmail: async () => USER.email,
      createWorkspace: create, attachJobToWorkspace: attach,
    };
    await expect(claimScan(input)).resolves.toEqual({ kind: "requires_verification" });
    expect(create).not.toHaveBeenCalled();
    expect(attach).not.toHaveBeenCalled();
  });

  it("requires verification even when the recipient already owns another workspace", async () => {
    await expect(claimScan(harness({ findWorkspaceForUser: async () => ({ id: "existing" }) })))
      .resolves.toEqual({ kind: "requires_verification" });
  });

  it("gives the same verification outcome for unattached and foreign-owned reports", async () => {
    await expect(claimScan(harness())).resolves.toEqual({ kind: "requires_verification" });
    await expect(claimScan(harness({ lookupJobBySlug: async () => ({ ...JOB, workspace_id: "foreign" }) })))
      .resolves.toEqual({ kind: "requires_verification" });
  });

  it("resumes a report already attached to this owner's workspace", async () => {
    await expect(claimScan(harness({
      lookupJobBySlug: async () => ({ ...JOB, workspace_id: "ws-1" }),
      findWorkspaceForUser: async () => ({ id: "ws-1" }),
    }))).resolves.toEqual({ kind: "claimed", workspaceId: "ws-1" });
  });

  it("refuses an anonymous visitor without reading jobs or workspace membership", async () => {
    const lookup = vi.fn();
    const find = vi.fn();
    await expect(claimScan(harness({ sessionUser: null, lookupJobBySlug: lookup, findWorkspaceForUser: find })))
      .resolves.toEqual({ kind: "not_entitled" });
    expect(lookup).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it("returns not_entitled for an unknown slug without reading membership", async () => {
    const find = vi.fn();
    await expect(claimScan(harness({ lookupJobBySlug: async () => null, findWorkspaceForUser: find })))
      .resolves.toEqual({ kind: "not_entitled" });
    expect(find).not.toHaveBeenCalled();
  });

  it.each(["job", "workspace"])("fails closed when the %s lookup throws", async (stage) => {
    const fail = async () => { throw new Error("private database detail"); };
    await expect(claimScan(harness(stage === "job" ? { lookupJobBySlug: fail } : { findWorkspaceForUser: fail })))
      .resolves.toEqual({ kind: "unavailable" });
  });
});
