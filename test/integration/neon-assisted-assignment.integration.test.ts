import { Pool } from "pg";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { resolveApplicationUser } from "../../lib/identity/users";
import { resolveAccessRequest } from "../../lib/repositories/access-requests";

const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock("../../lib/db/client", () => ({ getPool: () => ports.pool }));

const identity = (subject: string, email: string) => ({ provider: "neon" as const, subject, email, verified: true as const });

/**
 * The P2.4 acceptance criteria (Phase 2 backlog item 28), against a real
 * PostgreSQL. Docker is absent on the development machine, so these are written
 * blind and CI is the authority -- the same way the previous phase's
 * integration cases were handled.
 */
describe.runIf(process.env.NEON_INTEGRATION === "1")("Assisted ownership assignment", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query(
      "CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime",
    );
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href, max: 10 });
    ports.pool = runtime;
  });

  beforeEach(async () => {
    await runtime.query("DELETE FROM audit_events; DELETE FROM audit_jobs; DELETE FROM workspaces; DELETE FROM app_users");
  });

  afterAll(async () => {
    await Promise.all([owner?.end(), runtime?.end()]);
    fixture?.stop();
  });

  /** A finished, unclaimed job plus an open request against it. */
  async function seed({ placeId = "place-1" as string | null, businessName = "Race Cafe" } = {}) {
    const requester = await resolveApplicationUser(identity("requester", "racer@example.test"));
    const operator = await resolveApplicationUser(identity("operator", "ada.wong@fimmick.com"));
    const job = (
      await runtime.query<{ id: string }>(
        `INSERT INTO audit_jobs(share_slug,business_name,region,status,place_id)
         VALUES($1,$2,'hk','done',$3) RETURNING id`,
        [`slug-${businessName.replace(/\W+/g, "-").toLowerCase()}`, businessName, placeId],
      )
    ).rows[0];
    const request = (
      await runtime.query<{ id: string }>(
        "INSERT INTO workspace_access_requests(job_id,user_id) VALUES($1,$2) RETURNING id",
        [job.id, requester.id],
      )
    ).rows[0];
    return {
      requester,
      operator: { userId: operator.id, email: "ada.wong@fimmick.com" },
      job,
      input: {
        id: request.id,
        job_id: job.id,
        user_id: requester.id,
        requester_email: "racer@example.test",
        business_name: businessName,
        industry: null as string | null,
        district: null as string | null,
        region: "hk",
      },
    };
  }

  it("lets exactly one of two concurrent approvals win, and refuses the other visibly", async () => {
    const { input, operator, job } = await seed();
    const call = {
      request: input,
      decision: "approved" as const,
      reason: "Registration checked",
      verification: { method: "BR12345678", verified_by: "Ada Wong" },
      operator,
    };

    const [first, second] = await Promise.allSettled([resolveAccessRequest(call), resolveAccessRequest(call)]);

    // One wins; the other loses on audit_events_idempotency_key_idx.
    expect([first.status, second.status].sort()).toEqual(["fulfilled", "rejected"]);
    const loser = (first.status === "rejected" ? first : second) as PromiseRejectedResult;
    expect((loser.reason as { code?: string }).code).toBe("23505");

    // The refusal must be real, not cosmetic.
    const workspaces = (await runtime.query<{ id: string }>("SELECT id FROM workspaces WHERE business_name='Race Cafe'")).rows;
    expect(workspaces).toHaveLength(1);
    const attached = (await runtime.query<{ workspace_id: string | null }>("SELECT workspace_id FROM audit_jobs WHERE id=$1", [job.id])).rows[0];
    expect(attached.workspace_id).toBe(workspaces[0].id);
    const decisions = (
      await runtime.query("SELECT id FROM audit_events WHERE entity_id=$1 AND event='access_request.approved'", [input.id])
    ).rows;
    expect(decisions).toHaveLength(1);
    const closed = (
      await runtime.query<{ resolved_at: string | null }>("SELECT resolved_at FROM workspace_access_requests WHERE id=$1", [input.id])
    ).rows[0];
    expect(closed.resolved_at).not.toBeNull();
  });

  it("leaves a rejected requester a non-member, with the request closed", async () => {
    const { input, operator } = await seed({ businessName: "Rejected Cafe" });
    const result = await resolveAccessRequest({
      request: input,
      decision: "rejected",
      reason: "Could not verify the registration",
      verification: { method: "BR lookup", verified_by: "Ada Wong" },
      operator,
    });
    expect(result).toMatchObject({ ok: true, workspaceId: null });

    const memberships = (await runtime.query("SELECT id FROM workspace_members WHERE user_id=$1", [input.user_id])).rows;
    expect(memberships).toHaveLength(0);
    const workspaces = (await runtime.query("SELECT id FROM workspaces WHERE business_name='Rejected Cafe'")).rows;
    expect(workspaces).toHaveLength(0);
    const closed = (
      await runtime.query<{ resolved_at: string | null }>("SELECT resolved_at FROM workspace_access_requests WHERE id=$1", [input.id])
    ).rows[0];
    expect(closed.resolved_at).not.toBeNull();
  });

  /**
   * The manual-entry business this whole path exists for: no place_id, so the
   * Google-attested claim can never reach it.
   *
   * NOTE ON SCOPE. The plan phrased this as "request -> decision -> workspace ->
   * one task". Assignment creates the workspace, attaches the job and makes the
   * requester its owner; ACTION DERIVATION is not part of it -- that happens
   * when the owner completes onboarding through POST /api/workspaces/claim,
   * which neon-owner-sign-in-completion.integration.test.ts already covers. This
   * asserts through the boundary this code actually owns rather than claiming a
   * step it does not perform.
   */
  it("assigns a manual-entry business with no place_id", async () => {
    const { input, operator, job, requester } = await seed({ placeId: null, businessName: "Manual Cafe" });

    const result = await resolveAccessRequest({
      request: input,
      decision: "approved",
      reason: "Tenancy agreement checked in person",
      verification: { method: "Tenancy agreement", verified_by: "Ada Wong" },
      operator,
    });
    expect(result.workspaceId).toBeTruthy();

    const attached = (await runtime.query<{ workspace_id: string | null }>("SELECT workspace_id FROM audit_jobs WHERE id=$1", [job.id])).rows[0];
    expect(attached.workspace_id).toBe(result.workspaceId);
    const membership = (
      await runtime.query<{ role: string; accepted_at: string | null }>(
        "SELECT role, accepted_at FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",
        [result.workspaceId, requester.id],
      )
    ).rows[0];
    expect(membership).toMatchObject({ role: "owner" });
    expect(membership.accepted_at).not.toBeNull();
    const assigned = (
      await runtime.query("SELECT id FROM audit_events WHERE entity_id=$1 AND event='workspace.assigned'", [input.id])
    ).rows;
    expect(assigned).toHaveLength(1);
  });

  it("rolls everything back when the job was claimed while the request waited", async () => {
    const { input, operator, job } = await seed({ businessName: "Taken Cafe" });
    const other = (await runtime.query<{ id: string }>("INSERT INTO workspaces(slug) VALUES('taken') RETURNING id")).rows[0];
    await runtime.query("UPDATE audit_jobs SET workspace_id=$2 WHERE id=$1", [job.id, other.id]);

    await expect(
      resolveAccessRequest({
        request: input,
        decision: "approved",
        reason: "Registration checked",
        verification: { method: "BR12345678", verified_by: "Ada Wong" },
        operator,
      }),
    ).rejects.toThrow("already_claimed");

    // Nothing survives the rollback: no orphan workspace, no decision event,
    // and the request is still open for someone to decide properly.
    const workspaces = (await runtime.query("SELECT id FROM workspaces WHERE business_name='Taken Cafe'")).rows;
    expect(workspaces).toHaveLength(0);
    const events = (await runtime.query("SELECT id FROM audit_events WHERE entity_id=$1", [input.id])).rows;
    expect(events).toHaveLength(0);
    const stillOpen = (
      await runtime.query<{ resolved_at: string | null }>("SELECT resolved_at FROM workspace_access_requests WHERE id=$1", [input.id])
    ).rows[0];
    expect(stillOpen.resolved_at).toBeNull();
  });
});
