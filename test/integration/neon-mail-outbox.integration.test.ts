import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../scripts/neon/migrations";
import { mailOutboxRepository, type OutboxInsert } from "../../lib/repositories/mail-outbox";
import { LEASE_MINUTES } from "../../lib/mail/decide";
import { enqueueScanMail } from "../../lib/mail/enqueue";
import { deliverMail } from "../../lib/mail/deliver";
import { MAIL_TEMPLATES_VERSION } from "../../lib/mail/availability";
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

  /**
   * `claimDue`'s `now` and `mail_outbox.next_attempt_at`'s `now()` default
   * must agree on whose clock is authoritative -- the container's, not the
   * test process's. A JS `Date.now()` (host clock, millisecond truncation)
   * can land a hair before the DB's `now()` (container clock, microsecond
   * precision) at insert time, which makes a just-inserted row look not yet
   * due and a claim silently return `[]`. `offsetSeconds` shifts the reading
   * (positive = comfortably past any row's `next_attempt_at`; negative = a
   * point safely in the past for a `since` filter), all still read from the
   * one clock that actually stamped the rows.
   */
  const dbNow = async (offsetSeconds = 1): Promise<Date> =>
    (await runtime.query<{ t: Date }>("SELECT clock_timestamp() + make_interval(secs => $1) AS t", [offsetSeconds])).rows[0].t;

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

    // Pre-establish 8 physical connections so the pool never serializes
    // connection setup in front of the race below -- without this, `pool.connect()`
    // latency for later callers can make the 8 claims land nearly sequentially,
    // which would pass even without SKIP LOCKED and prove nothing about it.
    const warm = await Promise.all(Array.from({ length: 8 }, () => runtime.connect()));
    await Promise.all(warm.map((c) => c.release()));

    const now = await dbNow();
    const results = await Promise.all(Array.from({ length: 8 }, () => mailOutboxRepository(runtime).claimDue(now, 10)));
    const claimedIds = results.flatMap((r) => r.map((c) => c.id));
    expect(claimedIds).toHaveLength(3);
    expect(new Set(claimedIds).size).toBe(3);
    expect(new Set(claimedIds)).toEqual(new Set(ids));
    for (const id of ids) {
      expect(await row(id)).toMatchObject({ state: "sending", attempts: 1 });
    }
  });

  it("SKIP LOCKED lets a concurrent claimer skip a row held by an open transaction instead of blocking on it (would fail without SKIP LOCKED)", async () => {
    const ws = await workspace();
    const u = await user();
    const j = await job(ws);
    const id = randomUUID();
    await repo().insert([outboxRow({ id, workspace_id: ws, user_id: u, job_id: j })]);

    const a = await runtime.connect();
    const b = await runtime.connect();
    try {
      const claimTime = await dbNow();
      await a.query("BEGIN");
      // A claims and holds the row lock open inside its uncommitted transaction.
      const claimedByA = await mailOutboxRepository(a).claimDue(claimTime, 10);
      expect(claimedByA.map((r) => r.id)).toEqual([id]);

      // Without SKIP LOCKED, B's SELECT ... FOR UPDATE would block waiting for
      // A's lock and, with lock_timeout set, error out after ~1s instead of
      // resolving to []. With SKIP LOCKED it must simply omit the locked row.
      // `lock_timeout` is session-level on a pooled connection, so it is
      // explicitly RESET before this connection goes back to the pool.
      await b.query("SET lock_timeout = '1s'");
      const claimedByB = await mailOutboxRepository(b).claimDue(claimTime, 10);
      expect(claimedByB).toEqual([]);

      await a.query("COMMIT");

      // The row is now `sending` with a fresh, unexpired lease from A's commit
      // -- not due, so B's next claim (no open competing transaction now,
      // `now` at or after `claimTime` but still well inside the 5-minute
      // lease) still finds nothing to take.
      const claimedByBAfterCommit = await mailOutboxRepository(b).claimDue(await dbNow(), 10);
      expect(claimedByBAfterCommit).toEqual([]);
      expect(await row(id)).toMatchObject({ state: "sending", attempts: 1 });
    } finally {
      await a.query("ROLLBACK").catch(() => {});
      await b.query("RESET lock_timeout").catch(() => {});
      a.release();
      b.release();
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
    const now = await dbNow();
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

  it("optOut is atomic through a checked-out client with no surrounding BEGIN", async () => {
    const ws = await workspace();
    const u = await user();
    const j = await job(ws);
    await member(ws, u, { mailRescanComplete: true });
    const queuedId = randomUUID();
    await repo().insert([outboxRow({ id: queuedId, workspace_id: ws, user_id: u, job_id: j })]);

    const client = await runtime.connect();
    try {
      // No BEGIN here: a plain checked-out connection, exactly as risky as a
      // bare Pool for a caller that forgets to wrap two statements in a
      // transaction. optOut must still be atomic on its own.
      expect(await mailOutboxRepository(client).optOut(u, ws, "rescan_complete")).toEqual({ member: true });
    } finally {
      client.release();
    }
    expect(
      (await runtime.query("SELECT mail_rescan_complete FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [ws, u])).rows[0],
    ).toEqual({ mail_rescan_complete: false });
    expect(await row(queuedId)).toMatchObject({ state: "held", hold_reason: "opted_out" });
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
    const [claimed] = await repo().claimDue(await dbNow(), 10);
    await runtime.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [ws, u]);

    const facts = await repo().sendFacts(claimed);
    expect(facts.accepted).toBe(false);
  });

  it("operatorCounts totals dead rows unscoped, and groups queued/held by the last 24 hours (DB clock)", async () => {
    const ws = await workspace();
    const u = await user();
    const j = await job(ws);
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
    // A dead row from 2 days ago: deadTotal must still count it (unscoped,
    // matching the other operator "open" counts) even though it falls
    // outside the 24h window used for queued24h/held24h.
    await runtime.query(
      `INSERT INTO mail_outbox(id,workspace_id,user_id,job_id,kind,locale,state,payload,last_error,created_at,updated_at)
       VALUES($1,$2,$3,$4,'rescan_complete','en','dead','{}'::jsonb,'provider_error',now()-interval '2 days',now()-interval '2 days')`,
      [randomUUID(), ws, u, j],
    );
    // A queued row from 2 days ago must not count toward queued24h.
    await runtime.query(
      `INSERT INTO mail_outbox(id,workspace_id,user_id,job_id,kind,locale,state,payload,created_at)
       VALUES($1,$2,$3,$4,'rescan_complete','en','queued','{}'::jsonb,now()-interval '2 days')`,
      [randomUUID(), ws, u, j],
    );

    const counts = await repo().operatorCounts();
    expect(counts.deadTotal).toBe(2);
    expect(counts.queued24h).toBe(2);
    expect(counts.held24h.opted_out).toBe(1);
    expect(counts.held24h.no_address).toBe(2);
    expect(counts.held24h.kind_disabled).toBe(0);
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
    const u = await user("real-signin@example.test");
    await member(ws, u, { mailRescanComplete: false, mailRegressionAlert: false, email: "invite-address@example.test" });

    await repo().setMemberSwitches(ws, u, { rescanComplete: true, locale: "zh-TW" });
    expect(await repo().memberSwitches(ws, u)).toEqual({ rescanComplete: true, regressionAlert: false, locale: "zh-TW", address: "real-signin@example.test" });

    await repo().setMemberSwitches(ws, u, { regressionAlert: true, locale: null });
    expect(await repo().memberSwitches(ws, u)).toEqual({ rescanComplete: true, regressionAlert: true, locale: null, address: "real-signin@example.test" });
  });

  // Review finding: the settings page must name the address mail is actually
  // sent to. recipients()/sendFacts() resolve mail through app_users.email
  // for the member's user_id; workspace_members.email is only the invite
  // address and can differ (an owner invites someone@old-domain, the invitee
  // signs in with a different address on the same Neon Auth account).
  // memberSwitches must resolve the same way, not the invite address.
  it("memberSwitches resolves the address from app_users.email, not workspace_members.email", async () => {
    const ws = await workspace();
    const u = await user("app-users-address@example.test");
    await member(ws, u, { email: "workspace-members-invite-address@example.test" });

    const switches = await repo().memberSwitches(ws, u);

    expect(switches?.address).toBe("app-users-address@example.test");
    expect(switches?.address).not.toBe("workspace-members-invite-address@example.test");
  });

  it("memberSwitches is null for a caller with no accepted membership", async () => {
    const ws = await workspace();
    const u = await user();
    expect(await repo().memberSwitches(ws, u)).toBeNull();
  });

  const OPEN_MAIL_ENV = {
    APPLICATION_MAIL_APPROVED: MAIL_TEMPLATES_VERSION,
    RESEND_API_KEY: "re_fixture",
    REPORT_EMAIL_FROM: "notify@example.test",
    APP_ORIGIN: "http://localhost",
    MAIL_UNSUBSCRIBE_SECRET: "a".repeat(32),
  };

  it(
    "enqueueScanMail run twice in separate transactions for the same job inserts each member/kind row exactly once, and never resets a row a completed run finished (Task 5, Review Focus 3)",
    async () => {
      const ws = await workspace({ notifyRescanComplete: true, notifyRegressionAlert: true });
      const j = await job(ws);
      const u1 = await user("member-a@example.test");
      const u2 = await user("member-b@example.test");
      await member(ws, u1, { mailRescanComplete: true, mailRegressionAlert: true, email: "member-a@example.test" });
      await member(ws, u2, { mailRescanComplete: true, mailRegressionAlert: true, email: "member-b@example.test" });

      const input = {
        workspaceId: ws,
        jobId: j,
        status: "done",
        businessName: "Fixture",
        market: "hk" as const,
        workspacePath: "/owner/fixture",
        diff: { comparable: true, regressed_findings: ["gbp.rating_low"] },
      };

      // First completion attempt: two members x two mail kinds = 4 rows.
      const clientA = await runtime.connect();
      try {
        await clientA.query("BEGIN");
        expect(await enqueueScanMail(mailOutboxRepository(clientA), input, OPEN_MAIL_ENV)).toBe(4);
        await clientA.query("COMMIT");
      } finally {
        clientA.release();
      }

      const rows = (await runtime.query<{ id: string; user_id: string; kind: string }>(
        "SELECT id,user_id,kind FROM mail_outbox WHERE job_id=$1",
        [j],
      )).rows;
      expect(rows).toHaveLength(4);
      const sentTarget = rows.find((r) => r.user_id === u1 && r.kind === "rescan_complete")!;
      const heldTarget = rows.find((r) => r.user_id === u2 && r.kind === "regression_alert")!;
      expect(sentTarget).toBeDefined();
      expect(heldTarget).toBeDefined();

      // Between the two completion attempts, the delivery tick already sent
      // one row, and a member opted out of another -- exactly the two
      // "already moved on" outcomes Review Focus 3 says a retry must leave alone.
      await runtime.query("UPDATE mail_outbox SET state='sent', sent_at=now(), provider_message_id='msg_1' WHERE id=$1", [sentTarget.id]);
      await runtime.query("UPDATE mail_outbox SET state='held', hold_reason='opted_out' WHERE id=$1", [heldTarget.id]);

      // A retried completion (e.g. the ledger re-running this job after a
      // later step failed) calls enqueueScanMail again with identical input.
      const clientB = await runtime.connect();
      try {
        await clientB.query("BEGIN");
        expect(await enqueueScanMail(mailOutboxRepository(clientB), input, OPEN_MAIL_ENV)).toBe(0);
        await clientB.query("COMMIT");
      } finally {
        clientB.release();
      }

      expect((await runtime.query("SELECT count(*)::int AS n FROM mail_outbox WHERE job_id=$1", [j])).rows[0].n).toBe(4);
      expect(await row(sentTarget.id)).toMatchObject({ state: "sent", provider_message_id: "msg_1" });
      expect(await row(heldTarget.id)).toMatchObject({ state: "held", hold_reason: "opted_out" });
    },
  );

  it("enqueueScanMail stores the address only on queued rows; a held row's to_address is null", async () => {
    const ws = await workspace({ notifyRescanComplete: true, notifyRegressionAlert: true });
    const j = await job(ws);
    const on = await user("member-on@example.test");
    const off = await user("member-off@example.test");
    await member(ws, on, { mailRescanComplete: true, email: "member-on@example.test" });
    await member(ws, off, { mailRescanComplete: false, email: "member-off@example.test" });

    const input = {
      workspaceId: ws,
      jobId: j,
      status: "done",
      businessName: "Fixture",
      market: "hk" as const,
      workspacePath: "/owner/fixture",
      // A comparable diff with nothing regressed: rescan_complete only.
      diff: { comparable: true, regressed_findings: [] },
    };
    expect(await enqueueScanMail(repo(), input, OPEN_MAIL_ENV)).toBe(2);

    const rows = (
      await runtime.query<{ user_id: string; state: string; hold_reason: string | null; to_address: string | null }>(
        "SELECT user_id,state,hold_reason,to_address FROM mail_outbox WHERE job_id=$1",
        [j],
      )
    ).rows;
    expect(rows.find((r) => r.user_id === on)).toMatchObject({ state: "queued", to_address: "member-on@example.test" });
    expect(rows.find((r) => r.user_id === off)).toMatchObject({ state: "held", hold_reason: "opted_out", to_address: null });
  });

  it(
    "deliverMail itself re-checks and holds opted_out when the member's switch is flipped off after enqueue, leaving the row queued (Task 6, Review Focus 1)",
    async () => {
      const ws = await workspace();
      const u = await user();
      const j = await job(ws);
      await member(ws, u, { mailRescanComplete: true });
      const id = randomUUID();
      await repo().insert([outboxRow({ id, workspace_id: ws, user_id: u, job_id: j, kind: "rescan_complete" })]);

      // Flip the switch directly (not through optOut, which would hold the
      // row itself and leave deliverMail's own send-time re-check untested --
      // see the controller ruling on this test). The row stays queued so
      // deliverMail has to claim it and decide for itself.
      await repo().setMemberSwitches(ws, u, { rescanComplete: false, locale: null });
      expect(await row(id)).toMatchObject({ state: "queued", hold_reason: null });

      let sendCalled = false;
      const deliverNow = await dbNow();
      const summary = await deliverMail({
        repo: repo(),
        transport: {
          async send() {
            sendCalled = true;
            return { status: "accepted_by_provider" as const, providerMessageId: "should-not-happen" };
          },
        },
        env: OPEN_MAIL_ENV,
        now: () => deliverNow,
      });

      expect(sendCalled).toBe(false);
      expect(summary).toEqual({ sent: 0, retried: 0, held: 1, dead: 0, expired: 0, paused: false });
      expect(await row(id)).toMatchObject({ state: "held", hold_reason: "opted_out" });
    },
  );

  it(
    "deliverMail itself re-checks and holds not_member when the member's membership is removed after enqueue, leaving the row queued (Task 6, Review Focus 1)",
    async () => {
      const ws = await workspace();
      const u = await user();
      const j = await job(ws);
      await member(ws, u, { mailRescanComplete: true });
      // A second, owner member so the workspace survives removing `u` below
      // -- workspace_members' trigger deletes the whole workspace (and, by
      // cascade, this row's mail_outbox row) once its *last* member row goes,
      // which would make this test pass vacuously for the wrong reason.
      const owner = await user("owner-keeps-workspace-alive@example.test");
      await runtime.query(
        `INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,$3,'owner',now())`,
        [ws, owner, "owner-keeps-workspace-alive@example.test"],
      );
      const id = randomUUID();
      await repo().insert([outboxRow({ id, workspace_id: ws, user_id: u, job_id: j, kind: "rescan_complete" })]);

      // Removed outright (the accepted membership row is gone), not merely
      // opted out -- the row stays queued so deliverMail's own sendFacts
      // re-read has to discover the membership no longer exists.
      await runtime.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [ws, u]);
      expect(await row(id)).toMatchObject({ state: "queued", hold_reason: null });

      let sendCalled = false;
      const deliverNow = await dbNow();
      const summary = await deliverMail({
        repo: repo(),
        transport: {
          async send() {
            sendCalled = true;
            return { status: "accepted_by_provider" as const, providerMessageId: "should-not-happen" };
          },
        },
        env: OPEN_MAIL_ENV,
        now: () => deliverNow,
      });

      expect(sendCalled).toBe(false);
      expect(summary).toEqual({ sent: 0, retried: 0, held: 1, dead: 0, expired: 0, paused: false });
      expect(await row(id)).toMatchObject({ state: "held", hold_reason: "not_member" });
    },
  );
});
