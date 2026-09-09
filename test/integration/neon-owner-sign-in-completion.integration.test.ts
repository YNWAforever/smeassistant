import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { completeSignIn, type CompletionPorts } from "../../lib/identity/complete-sign-in";
import { resolveApplicationUser } from "../../lib/identity/users";
import { claimsRepository as claims } from "../../lib/repositories/claims";
import { membershipRepository as members } from "../../lib/repositories/membership";
import { claimScan } from "../../lib/workspace/claim-scan";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";

const database = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock("../../lib/db/client", () => ({ getPool: () => database.pool }));

const identity = (subject = "owner", email = "owner@example.test") => ({
  provider: "neon" as const, subject, email, verified: true as const,
});

describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon owner sign-in completion", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href, max: 10 });
    database.pool = runtime;
  });

  beforeEach(async () => {
    await runtime.query("DELETE FROM audit_jobs; DELETE FROM workspaces; DELETE FROM app_users");
  });

  afterAll(async () => {
    await Promise.all([owner?.end(), runtime?.end()]);
    fixture?.stop();
  });

  function ports(user: { id: string; email: string; verified: boolean }, finishClaim: CompletionPorts["finishClaim"]): CompletionPorts {
    return {
      getIdentity: async () => identity(),
      mapIdentity: async () => user,
      bindInvitations: async (mapped) => { await members.bindPending(mapped); },
      hasAcceptedMembership: async (userId) => (await members.listAccepted(userId)).length > 0,
      finishClaim,
      clearInvalidSession: async () => {},
      reportFailure: () => {},
    };
  }

  it("concurrently binds one invitation without changing its accepted ownership", async () => {
    const user = await resolveApplicationUser(identity());
    const workspaceId = (await runtime.query("INSERT INTO workspaces(slug) VALUES('invite') RETURNING id")).rows[0].id as string;
    await runtime.query("INSERT INTO workspace_members(workspace_id,email,role) VALUES($1,$2,'viewer')", [workspaceId, user.email]);

    const results = await Promise.all(Array.from({ length: 8 }, () => completeSignIn(
      { locale: "en", claim: null, returnTo: null, method: "email" },
      ports(user, async () => null),
    )));

    expect(results).toEqual(Array.from({ length: 8 }, () => ({ kind: "redirect", destination: "/en/owner/select-workspace" })));
    const rows = (await runtime.query("SELECT user_id,accepted_at,role FROM workspace_members WHERE workspace_id=$1", [workspaceId])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: user.id, role: "viewer" });
    expect(rows[0].accepted_at).not.toBeNull();
  });

  it("replays an existing claimed report without changing ownership or access-request count", async () => {
    const user = await resolveApplicationUser(identity());
    const workspace = await claims.createWorkspaceWithOwner({
      ownerUserId: user.id, ownerEmail: user.email, businessName: "Fixture", industry: null, district: null, market: "hk",
    });
    await runtime.query("INSERT INTO audit_jobs(business_name,share_slug,workspace_id) VALUES('Fixture','claim-1',$1)", [workspace.id]);
    const before = (await runtime.query("SELECT workspace_id FROM audit_jobs WHERE share_slug='claim-1'")).rows[0].workspace_id;
    const acceptedAt = (await runtime.query("SELECT accepted_at FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [workspace.id, user.id])).rows[0].accepted_at;

    const finishClaim: CompletionPorts["finishClaim"] = async (mapped, flow) => {
      const outcome = await claimScan({
        slug: flow.claim!, sessionUser: { id: mapped.id, email: mapped.email }, selfServiceEnabled: false,
        lookupJobBySlug: claims.jobBySlug, hasViewerGrant: async () => false, lookupLeadEmail: claims.firstLeadEmail,
        findWorkspaceForUser: async (userId) => {
          const found = await members.ownedWorkspace(userId);
          return found ? { id: found.workspaceId } : null;
        },
        createWorkspace: claims.createWorkspaceWithOwner, attachJobToWorkspace: claims.attachJob,
      });
      return outcome.kind === "unavailable" ? null : `/en/owner/onboarding?claim=${flow.claim}&claimed=${outcome.kind}`;
    };
    const results = await Promise.all(Array.from({ length: 8 }, () => completeSignIn(
      { locale: "en", claim: "claim-1", returnTo: null, method: "google" }, ports(user, finishClaim),
    )));

    expect(results).toEqual(Array.from({ length: 8 }, () => ({ kind: "redirect", destination: "/en/owner/onboarding?claim=claim-1&claimed=claimed" })));
    expect((await runtime.query("SELECT workspace_id FROM audit_jobs WHERE share_slug='claim-1'")).rows[0].workspace_id).toBe(before);
    expect((await runtime.query("SELECT accepted_at FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [workspace.id, user.id])).rows[0].accepted_at).toEqual(acceptedAt);
    expect((await runtime.query("SELECT count(*)::int AS count FROM workspace_access_requests")).rows[0].count).toBe(0);
  });
});
