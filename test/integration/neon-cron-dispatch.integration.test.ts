import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { schedulerRepository } from "../../lib/repositories/scheduler";
import { notifyDueSchedules } from "../../lib/scan/notify-due-schedules";

const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock("../../lib/db/client", () => ({ getPool: () => ports.pool, getDatabase: () => drizzle(ports.pool!) }));

describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon cron dispatch: due schedules and claimable jobs", () => {
  let fixture: NeonDatabaseFixture, owner: Pool, runtime: Pool;

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
    runtime = new Pool({ connectionString: url.href });
    ports.pool = runtime;
  });

  beforeEach(async () => {
    vi.stubGlobal("fetch", () => {
      throw new Error("transport forbidden");
    });
    await runtime.query("DELETE FROM scan_schedules; DELETE FROM audit_jobs; DELETE FROM workspaces; DELETE FROM app_users");
  });

  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    await Promise.all([owner?.end(), runtime?.end()]);
    fixture?.stop();
  });

  async function workspace(overrides: { tier?: string; notify_monthly_digest?: boolean } = {}) {
    return (
      await runtime.query(
        "INSERT INTO workspaces(slug,market,tier,notify_monthly_digest) VALUES($1,'hk',$2,$3) RETURNING id",
        [`ws-${crypto.randomUUID()}`, overrides.tier ?? "paid", overrides.notify_monthly_digest ?? true],
      )
    ).rows[0].id;
  }

  async function member(workspaceId: string) {
    const user = (await runtime.query("INSERT INTO app_users(email) VALUES($1) RETURNING id", [`${crypto.randomUUID()}@example.test`])).rows[0].id;
    await runtime.query(
      "INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,$3,'owner',now())",
      [workspaceId, user, `${user}@example.test`],
    );
    return user;
  }

  // `created_by` only needs a valid app_users row (scan_schedules_created_by_fkey
  // references app_users, not workspace_members); it deliberately does NOT reuse
  // member() here. workspace_members_one_owner_idx allows at most one
  // role='owner' row per workspace, and every caller below that wants a
  // notification recipient already calls member(ws) itself before scheduling --
  // routing created_by through member() too would insert a second owner row for
  // the same workspace and fail that unique index.
  async function schedule(workspaceId: string | null, nextRunAt: string) {
    const createdBy = (
      await runtime.query("INSERT INTO app_users(email) VALUES($1) RETURNING id", [`${crypto.randomUUID()}@example.test`])
    ).rows[0].id;
    return (
      await runtime.query(
        "INSERT INTO scan_schedules(place_id,input_snapshot,cadence,anniversary_day,next_run_at,created_by,workspace_id) VALUES($1,'{}'::jsonb,'monthly',15,$2,$3,$4) RETURNING id",
        [`place-${crypto.randomUUID()}`, nextRunAt, createdBy, workspaceId],
      )
    ).rows[0].id;
  }

  it("finds a due schedule, notifies its paid opted-in workspace, and advances next_run_at", async () => {
    const ws = await workspace();
    const ownerId = await member(ws);
    const scheduleId = await schedule(ws, "2026-09-01T00:00:00Z");
    const { rows: [{ slug }] } = await runtime.query("SELECT slug FROM workspaces WHERE id=$1", [ws]);

    const result = await notifyDueSchedules("2026-09-13T00:00:00Z");

    expect(result).toEqual({ due: 1, notified: 1 });
    // anniversary_day=15 is still ahead of "now" (the 13th) within the same
    // month, so nextRunAfter lands on 2026-09-15, not next month -- see
    // lib/scheduler/next-run.ts and its "still ahead" test case.
    expect((await runtime.query("SELECT next_run_at FROM scan_schedules WHERE id=$1", [scheduleId])).rows[0].next_run_at.toISOString()).toBe(
      "2026-09-15T00:00:00.000Z",
    );
    // Asserting user_id and href too (not just kind/workspace_id) proves the
    // real acceptedMemberIds fan-out and the real workspaceHref lookup both
    // ran against this row, not just that some row landed.
    expect((await runtime.query("SELECT kind,workspace_id,user_id,href FROM workspace_notifications WHERE workspace_id=$1", [ws])).rows).toEqual([
      { kind: "schedule.due", workspace_id: ws, user_id: ownerId, href: `/owner/${slug}` },
    ]);
  });

  it("locks a due schedule so a concurrent tick's dueSchedules call excludes it, per FOR UPDATE OF s SKIP LOCKED", async () => {
    const ws = await workspace();
    await member(ws);
    await schedule(ws, "2026-09-01T00:00:00Z");
    const nowIso = "2026-09-13T00:00:00Z";

    // Two separate physical connections, simulating two overlapping cron
    // ticks. clientA opens a real transaction and locks the due row via
    // dueSchedules' own FOR UPDATE OF s -- without committing or rolling
    // back, so the lock stays held exactly like it would mid-tick.
    const clientA = await runtime.connect();
    const clientB = await runtime.connect();
    try {
      await clientA.query("BEGIN");
      const firstTick = await schedulerRepository(clientA).dueSchedules(nowIso);
      expect(firstTick).toHaveLength(1);

      // clientB's identical query, from its own transaction, must SKIP the
      // row clientA is still holding -- not block, not error, not see it.
      await clientB.query("BEGIN");
      const secondTick = await schedulerRepository(clientB).dueSchedules(nowIso);
      expect(secondTick).toEqual([]);

      await clientB.query("ROLLBACK");
      await clientA.query("ROLLBACK");
    } finally {
      clientA.release();
      clientB.release();
    }
  });

  it("advances a lite-tier workspace's schedule without creating a notification", async () => {
    const ws = await workspace({ tier: "lite" });
    await member(ws);
    const scheduleId = await schedule(ws, "2026-09-01T00:00:00Z");

    const result = await notifyDueSchedules("2026-09-13T00:00:00Z");

    expect(result).toEqual({ due: 1, notified: 0 });
    expect((await runtime.query("SELECT next_run_at FROM scan_schedules WHERE id=$1", [scheduleId])).rows[0].next_run_at).not.toBeNull();
    expect((await runtime.query("SELECT id FROM workspace_notifications WHERE workspace_id=$1", [ws])).rows).toEqual([]);
  });

  it("ignores a schedule that is not yet due", async () => {
    const ws = await workspace();
    await schedule(ws, "2026-12-01T00:00:00Z");

    expect(await notifyDueSchedules("2026-09-13T00:00:00Z")).toEqual({ due: 0, notified: 0 });
  });

  it("finds a fresh queued job and a stale mid-collection job, but not a fresh in-flight one", async () => {
    const queued = (await runtime.query("INSERT INTO audit_jobs(business_name,status) VALUES('Queued','queued') RETURNING id")).rows[0].id;
    const stale = (
      await runtime.query(
        "INSERT INTO audit_jobs(business_name,status,attempt_count,last_attempt_at) VALUES('Stale','collecting',1,now()-interval '31 minutes') RETURNING id",
      )
    ).rows[0].id;
    await runtime.query(
      "INSERT INTO audit_jobs(business_name,status,attempt_count,last_attempt_at) VALUES('Fresh in-flight','collecting',1,now())",
    );
    await runtime.query(
      "INSERT INTO audit_jobs(business_name,status,attempt_count,last_attempt_at) VALUES('Exhausted','collecting',3,now()-interval '31 minutes')",
    );

    const ids = await schedulerRepository(runtime).claimableJobIds(20);

    expect(new Set(ids)).toEqual(new Set([queued, stale]));
  });

  it("offers first attempts before retries, oldest first, so refused retries cannot fill the batch", async () => {
    // The order the batch must come back in: the queued first attempt, then
    // retries by attempt_count and then age (oldest first).
    const retries = Array.from({ length: 21 }, (_, i) => ({ attempts: i < 10 ? 1 : 2, hoursOld: 30 - i }));
    // Inserted in exactly the reverse of that order, so heap order without
    // an ORDER BY can never match it.
    const ids = new Map<number, string>();
    for (let i = retries.length - 1; i >= 0; i--) {
      ids.set(
        i,
        (
          await runtime.query(
            "INSERT INTO audit_jobs(business_name,status,attempt_count,last_attempt_at,created_at) VALUES('Refused retry','collecting',$1,now()-interval '31 minutes',now()-make_interval(hours=>$2)) RETURNING id",
            [retries[i].attempts, retries[i].hoursOld],
          )
        ).rows[0].id,
      );
    }
    const queued = (await runtime.query("INSERT INTO audit_jobs(business_name,status) VALUES('Admitted','queued') RETURNING id")).rows[0].id;

    const batch = await schedulerRepository(runtime).claimableJobIds(20);

    expect(batch).toContain(queued);
    expect(batch).toEqual([queued, ...Array.from({ length: 19 }, (_, i) => ids.get(i))]);
  });
});
