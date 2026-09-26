import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../scripts/neon/migrations";
import { mailOutboxRepository, type OutboxInsert } from "../../lib/repositories/mail-outbox";
import { LEASE_MINUTES } from "../../lib/mail/decide";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";

describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon mail outbox repository", () => {
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
  });

  beforeEach(async () => {
    await runtime.query("DELETE FROM audit_jobs; DELETE FROM workspaces; DELETE FROM app_users");
  });

  afterAll(async () => {
    await Promise.all([runtime?.end(), owner?.end()]);
    fixture?.stop();
  });

  // `runtime` is only assigned inside beforeAll, so this must stay a fresh
  // call per use rather than a single value captured at describe() time.
  const repo = () => mailOutboxRepository(runtime);

  async function workspace(overrides: { notifyRescanComplete?: boolean; notifyRegressionAlert?: boolean } = {}): Promise<string> {
    return (
      await runtime.query(
        "INSERT INTO workspaces(slug,notify_rescan_complete,notify_regression_alert) VALUES($1,$2,$3) RETURNING id",
        [`ws-${randomUUID().slice(0, 8)}`, overrides.notifyRescanComplete ?? true, overrides.notifyRegressionAlert ?? true],
      )
    ).rows[0].id as string;
  }

  async function user(email = `fixture-${randomUUID().slice(0, 8)}@example.test`): Promise<string> {
    return (await runtime.query("INSERT INTO app_users(email) VALUES($1) RETURNING id", [email])).rows[0].id as string;
  }

  async function job(workspaceId: string): Promise<string> {
    return (
      await runtime.query("INSERT INTO audit_jobs(business_name,workspace_id,status) VALUES('Fixture',$1,'done') RETURNING id", [
        workspaceId,
      ])
    ).rows[0].id as string;
  }

  async function member(
    workspaceId: string,
    userId: string,
    opts: { accepted?: boolean; mailRescanComplete?: boolean; mailRegressionAlert?: boolean; email?: string } = {},
  ): Promise<void> {
    // 'manager', not 'owner': workspace_members_one_owner_idx allows at most one
    // owner per workspace, and the sole owner cannot be DELETEd at all
    // (0005_owner_removal_guard.sql). Neither restriction is what these tests
    // are about, so a non-owner role keeps them out of the way.
    await runtime.query(
      `INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at,mail_rescan_complete,mail_regression_alert)
       VALUES($1,$2,$3,'manager',$4,$5,$6)`,
      [
        workspaceId,
        userId,
        opts.email ?? `member-${randomUUID().slice(0, 6)}@example.test`,
        opts.accepted === false ? null : new Date(),
        opts.mailRescanComplete ?? false,
        opts.mailRegressionAlert ?? false,
      ],
    );
  }

  function outboxRow(overrides: Partial<OutboxInsert> & { workspace_id: string; user_id: string; job_id: string }): OutboxInsert {
    return {
      id: randomUUID(),
      kind: "rescan_complete",
      to_address: "member@example.test",
      locale: "en",
      state: "queued",
      hold_reason: null,
      payload: { businessName: "Fixture", regressedCount: null, workspacePath: null },
      ...overrides,
    };
  }

  const row = async (id: string) => (await runtime.query("SELECT * FROM mail_outbox WHERE id=$1", [id])).rows[0];

  it("does not resurrect or reset a row on a duplicate insert (Review Focus 3)", async () => {
    const ws = await workspace();
    const u = await user();
    const j = await job(ws);
    const id = randomUUID();
    const heldRow = outboxRow({ id, workspace_id: ws, user_id: u, job_id: j, state: "held", hold_reason: "opted_out" });
    expect(await repo().insert([heldRow])).toBe(1);
    expect(await row(id)).toMatchObject({ state: "held", hold_reason: "opted_out" });

    // A later completion retry tries to insert the same id again as queued.
    const again = outboxRow({ id, workspace_id: ws, user_id: u, job_id: j, state: "queued", hold_reason: null });
    expect(await repo().insert([again])).toBe(0);
    expect(await row(id)).toMatchObject({ state: "held", hold_reason: "opted_out" });
    expect((await runtime.query("SELECT count(*)::int AS n FROM mail_outbox WHERE id=$1", [id])).rows[0].n).toBe(1);
  });

  it("partitions 8 concurrent claims of 3 due rows so each id is claimed exactly once", async () => {
    const ws = await workspace();
    const u = await user();
    const j = await job(ws);
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    await repo().insert(ids.map((id) => outboxRow({ id, workspace_id: ws, user_id: u, job_id: j })));

    const now = new Date();
    const results = await Promise.all(Array.from({ length: 8 }, () => mailOutboxRepository(runtime).claimDue(now, 10)));
    const claimedIds = results.flatMap((r) => r.map((c) => c.id));
    expect(claimedIds).toHaveLength(3);
    expect(new Set(claimedIds).size).toBe(3);
    expect(new Set(claimedIds)).toEqual(new Set(ids));
    for (const id of ids) {
      expect(await row(id)).toMatchObject({ state: "sending", attempts: 1 });
    }
  });

  it("reclaims an expired sending lease with a fresh token; finishing with the stale token changes nothing (Review Focus 4)", async () => {
    const ws = await workspace();
    const u = await user();
    const j = await job(ws);
    const id = randomUUID();
    const staleToken = randomUUID();
    await runtime.query(
      `INSERT INTO mail_outbox(id,workspace_id,user_id,job_id,kind,to_address,locale,state,payload,attempts,lease_token,lease_until,next_attempt_at)
       VALUES($1,$2,$3,$4,'rescan_complete','a@example.test','en','sending','{}'::jsonb,1,$5,now()-interval '1 minute',now())`,
      [id, ws, u, j, staleToken],
    );

    const now = new Date();
    const claimed = await repo().claimDue(now, 10);
    expect(claimed).toHaveLength(1);
    const newToken = claimed[0].lease_token;
    expect(newToken).not.toBe(staleToken);
    expect(claimed[0].attempts).toBe(2);

    // The old holder's finish is a no-op: the row is still owned by the new lease.
    expect(await repo().finish(id, staleToken, { state: "sent", providerMessageId: "msg_1", toAddress: "a@example.test" })).toBe(false);
    const after = await row(id);
    expect(after.state).toBe("sending");
    expect(after.lease_token).toBe(newToken);

    // The new holder can finish it normally.
    expect(await repo().finish(id, newToken, { state: "sent", providerMessageId: "msg_1", toAddress: "a@example.test" })).toBe(true);
    expect((await row(id)).state).toBe("sent");
    expect((await row(id)).lease_token).toBeNull();
  });

  it("expires a lease reclaim by roughly LEASE_MINUTES", async () => {
    const ws = await workspace();
    const u = await user();
    const j = await job(ws);
    const id = randomUUID();
    await repo().insert([outboxRow({ id, workspace_id: ws, user_id: u, job_id: j })]);
    const now = new Date();
    const [claimed] = await repo().claimDue(now, 10);
    const minutes = (new Date(claimed.lease_until).getTime() - now.getTime()) / 60_000;
    expect(minutes).toBeGreaterThan(LEASE_MINUTES - 0.5);
    expect(minutes).toBeLessThan(LEASE_MINUTES + 0.5);
  });

  it("optOut flips the switch and holds the member's queued row of that kind", async () => {
    const ws = await workspace();
    const u = await user();
    const j = await job(ws);
    await member(ws, u, { mailRescanComplete: true, mailRegressionAlert: true });
    const queuedId = randomUUID();
    const otherKindId = randomUUID();
    await repo().insert([
      outboxRow({ id: queuedId, workspace_id: ws, user_id: u, job_id: j, kind: "rescan_complete" }),
      outboxRow({ id: otherKindId, workspace_id: ws, user_id: u, job_id: j, kind: "regression_alert" }),
    ]);

    expect(await repo().optOut(u, ws, "rescan_complete")).toEqual({ member: true });
    expect(
      (await runtime.query("SELECT mail_rescan_complete,mail_regression_alert FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [ws, u]))
        .rows[0],
    ).toEqual({ mail_rescan_complete: false, mail_regression_alert: true });
    expect(await row(queuedId)).toMatchObject({ state: "held", hold_reason: "opted_out" });
    // A different kind's queued row is untouched.
    expect(await row(otherKindId)).toMatchObject({ state: "queued", hold_reason: null });
  });

  it("optOut for a member with no accepted row returns member:false and changes nothing", async () => {
    const ws = await workspace();
    const u = await user();
    const j = await job(ws);
    // Never accepted (pending invite).
    await member(ws, u, { accepted: false });
    const id = randomUUID();
    await repo().insert([outboxRow({ id, workspace_id: ws, user_id: u, job_id: j })]);

    expect(await repo().optOut(u, ws, "rescan_complete")).toEqual({ member: false });
    expect((await runtime.query("SELECT mail_rescan_complete FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [ws, u])).rows[0])
      .toEqual({ mail_rescan_complete: false });
    expect(await row(id)).toMatchObject({ state: "queued", hold_reason: null });
  });

  it("optOut for a removed member (no membership row at all) returns member:false", async () => {
    const ws = await workspace();
    const u = await user();
    expect(await repo().optOut(u, ws, "rescan_complete")).toEqual({ member: false });
  });

  it("recipients reads gate, switch, address and locale correctly", async () => {
    const ws = await workspace({ notifyRescanComplete: true, notifyRegressionAlert: false });
    const uAccepted = await user("owner@example.test");
    await member(ws, uAccepted, { mailRescanComplete: true, mailRegressionAlert: true, email: "owner@example.test" });
    await runtime.query("UPDATE workspace_members SET mail_locale='zh-HK' WHERE workspace_id=$1 AND user_id=$2", [ws, uAccepted]);
    const uPending = await user("pending@example.test");
    await member(ws, uPending, { accepted: false, email: "pending@example.test" });

    const rescanRecipients = await repo().recipients(ws, "rescan_complete");
    expect(rescanRecipients).toHaveLength(1);
    expect(rescanRecipients[0]).toEqual({
      userId: uAccepted,
      facts: { accepted: true, kindAllowed: true, optedIn: true, address: "owner@example.test" },
      locale: "zh-HK",
    });

    const regressionRecipients = await repo().recipients(ws, "regression_alert");
    expect(regressionRecipients).toHaveLength(1);
    expect(regressionRecipients[0].facts.kindAllowed).toBe(false);
  });

  it("sendFacts reports not_member for a membership removed since enqueue", async () => {
    const ws = await workspace();
    const u = await user("left@example.test");
    const j = await job(ws);
    const id = randomUUID();
    await member(ws, u, { mailRescanComplete: true });
    await repo().insert([outboxRow({ id, workspace_id: ws, user_id: u, job_id: j })]);
    const [claimed] = await repo().claimDue(new Date(), 10);
    await runtime.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [ws, u]);

    const facts = await repo().sendFacts(claimed);
    expect(facts.accepted).toBe(false);
  });

  it("counts groups held reasons and counts queued/dead", async () => {
    const ws = await workspace();
    const u = await user();
    const j = await job(ws);
    const since = new Date(Date.now() - 60_000);
    await repo().insert([
      outboxRow({ id: randomUUID(), workspace_id: ws, user_id: u, job_id: j, state: "queued" }),
      outboxRow({ id: randomUUID(), workspace_id: ws, user_id: u, job_id: j, state: "queued" }),
      outboxRow({ id: randomUUID(), workspace_id: ws, user_id: u, job_id: j, state: "held", hold_reason: "opted_out" }),
      outboxRow({ id: randomUUID(), workspace_id: ws, user_id: u, job_id: j, state: "held", hold_reason: "no_address" }),
      outboxRow({ id: randomUUID(), workspace_id: ws, user_id: u, job_id: j, state: "held", hold_reason: "no_address" }),
    ]);
    await runtime.query(
      `INSERT INTO mail_outbox(id,workspace_id,user_id,job_id,kind,locale,state,payload,last_error)
       VALUES($1,$2,$3,$4,'rescan_complete','en','dead','{}'::jsonb,'provider_error')`,
      [randomUUID(), ws, u, j],
    );

    const counts = await repo().counts(since);
    expect(counts.queued).toBe(2);
    expect(counts.dead).toBe(1);
    expect(counts.held.opted_out).toBe(1);
    expect(counts.held.no_address).toBe(2);
    expect(counts.held.kind_disabled).toBe(0);
  });

  it("deadRows lists dead rows without addresses", async () => {
    const ws = await workspace();
    const u = await user("hidden@example.test");
    const j = await job(ws);
    const id = randomUUID();
    await runtime.query(
      `INSERT INTO mail_outbox(id,workspace_id,user_id,job_id,kind,to_address,locale,state,payload,last_error,attempts)
       VALUES($1,$2,$3,$4,'rescan_complete','hidden@example.test','en','dead','{}'::jsonb,'provider_error',5)`,
      [id, ws, u, j],
    );
    const dead = await repo().deadRows(10);
    expect(dead).toHaveLength(1);
    expect(dead[0]).toMatchObject({ id, workspace_id: ws, kind: "rescan_complete", attempts: 5, last_error: "provider_error" });
    expect(Object.keys(dead[0])).not.toContain("to_address");
  });

  it("setMemberSwitches updates only provided keys and always writes locale", async () => {
    const ws = await workspace();
    const u = await user();
    await member(ws, u, { mailRescanComplete: false, mailRegressionAlert: false });

    await repo().setMemberSwitches(ws, u, { rescanComplete: true, locale: "zh-TW" });
    expect(await repo().memberSwitches(ws, u)).toEqual({ rescanComplete: true, regressionAlert: false, locale: "zh-TW" });

    await repo().setMemberSwitches(ws, u, { regressionAlert: true, locale: null });
    expect(await repo().memberSwitches(ws, u)).toEqual({ rescanComplete: true, regressionAlert: true, locale: null });
  });

  it("memberSwitches is null for a caller with no accepted membership", async () => {
    const ws = await workspace();
    const u = await user();
    expect(await repo().memberSwitches(ws, u)).toBeNull();
  });
});
