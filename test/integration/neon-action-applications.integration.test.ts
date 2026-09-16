import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { applicationRepository } from "../../lib/repositories/applications";

describe.runIf(process.env.NEON_INTEGRATION === "1")("action applications", () => {
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
  });

  beforeEach(async () => {
    vi.stubGlobal("fetch", () => { throw new Error("transport forbidden"); });
    await runtime.query("DELETE FROM action_applications; DELETE FROM actions; DELETE FROM workspaces; DELETE FROM app_users");
  });

  // Matches neon-cron-dispatch.integration.test.ts. Harmless today because the
  // stub is idempotent and vitest isolates test files, but without it a future
  // case here that legitimately needs fetch would silently inherit the
  // forbidding stub with no visible cleanup contract.
  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    await Promise.all([owner?.end(), runtime?.end()]);
    fixture?.stop();
  });

  async function seed(actionState = "recommended") {
    const ws = (await runtime.query("INSERT INTO workspaces(slug,market) VALUES($1,'hk') RETURNING id", [`ws-${crypto.randomUUID()}`])).rows[0].id;
    const user = (await runtime.query("INSERT INTO app_users(email) VALUES($1) RETURNING id", [`${crypto.randomUUID()}@example.test`])).rows[0].id;
    const action = (await runtime.query(
      `INSERT INTO actions(workspace_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,action_state)
       VALUES($1,'ig-bio','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'medium',20,'[]'::jsonb,5,'Live',$2,$3) RETURNING id`,
      [ws, `dedupe-${crypto.randomUUID()}`, actionState],
    )).rows[0].id;
    return { ws, user, action };
  }

  // Two live owner_asserted rows for the same action require two DIFFERENT
  // output_version_id values -- assertApplied's duplicate guard refuses a
  // second live assertion for the same (action, output_version_id), null
  // included, via IS NOT DISTINCT FROM. Columns read from
  // neon/migrations/0002_business.sql's output_versions definition.
  async function approvedVersion(ws: string, action: string): Promise<string> {
    const versionNo = (
      await runtime.query("SELECT COALESCE(MAX(version_no), 0) + 1 AS next FROM output_versions WHERE action_id = $1", [action])
    ).rows[0].next;
    return (
      await runtime.query(
        `INSERT INTO output_versions(workspace_id,action_id,version_no,body,author_type,approval_state)
         VALUES($1,$2,$3,'body','user','approved') RETURNING id`,
        [ws, action, versionNo],
      )
    ).rows[0].id;
  }

  it("records an assertion and completes the action in one transaction", async () => {
    const { ws, user, action } = await seed();
    const created = await applicationRepository(runtime).assertApplied(
      { workspace_id: ws, action_id: action, output_version_id: null, source: "owner_asserted", asserted_by: user, note: null, evidence: null },
      new Date().toISOString(),
    );
    expect(created).not.toBeNull();
    expect((await runtime.query("SELECT action_state FROM actions WHERE id=$1", [action])).rows[0].action_state).toBe("completed");
  });

  it("refuses to assert on a dismissed action and writes nothing", async () => {
    const { ws, user, action } = await seed("dismissed");
    const created = await applicationRepository(runtime).assertApplied(
      { workspace_id: ws, action_id: action, output_version_id: null, source: "owner_asserted", asserted_by: user, note: null, evidence: null },
      new Date().toISOString(),
    );
    expect(created).toEqual({ ok: false, reason: "closed" });
    expect((await runtime.query("SELECT id FROM action_applications WHERE action_id=$1", [action])).rows).toEqual([]);
  });

  it("retraction stamps rather than deletes, and reopens the action", async () => {
    const { ws, user, action } = await seed();
    const repo = applicationRepository(runtime);
    await repo.assertApplied(
      { workspace_id: ws, action_id: action, output_version_id: null, source: "owner_asserted", asserted_by: user, note: null, evidence: null },
      new Date().toISOString(),
    );
    expect(await repo.retract(ws, action, user, new Date().toISOString())).not.toBeNull();

    expect((await runtime.query("SELECT action_state,completed_at FROM actions WHERE id=$1", [action])).rows[0]).toMatchObject({ action_state: "in_progress", completed_at: null });
    const rows = (await runtime.query("SELECT retracted_at,retracted_by FROM action_applications WHERE action_id=$1", [action])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].retracted_at).not.toBeNull();
    expect(rows[0].retracted_by).toBe(user);
    expect(await repo.forActions(ws, [action])).toEqual([]);
  });

  it("an ordinary assertion does not trip fence_workspace_completion_write", async () => {
    // The fence is opt-in: it returns immediately unless app.completion_job and
    // app.completion_token are set, which only the completion receiver does.
    // This is the actual production path for an owner request -- session
    // variables unset -- and it must not raise.
    const { ws, user, action } = await seed();
    await expect(
      applicationRepository(runtime).assertApplied(
        { workspace_id: ws, action_id: action, output_version_id: null, source: "owner_asserted", asserted_by: user, note: null, evidence: null },
        new Date().toISOString(),
      ),
    ).resolves.not.toBeNull();
  });

  // Added after Task 5's review. assertApplied's INSERT guard and its
  // diagnostic query carry near-identical predicates that must stay in
  // lockstep: if a future edit changes one and not the other, a duplicate
  // submit gets reported as "this action is closed" (or the reverse) while
  // every unit test still passes, because they all mock the repository. Only a
  // real Postgres run can catch that drift.
  it("tells a duplicate submit apart from a closed action", async () => {
    const { ws, user, action } = await seed();
    const repo = applicationRepository(runtime);
    const row = { workspace_id: ws, action_id: action, output_version_id: null, source: "owner_asserted" as const, asserted_by: user, note: null, evidence: null };

    const first = await repo.assertApplied(row, new Date().toISOString());
    expect(first.ok).toBe(true);

    // Same action, same (null) version, still live -> duplicate, not closed.
    const second = await repo.assertApplied(row, new Date().toISOString());
    expect(second).toMatchObject({ ok: false, reason: "duplicate" });
    expect(second.ok === false && second.existingId).toBe(first.ok === true && first.id);

    // Exactly one row, so the guard prevented the write rather than merely
    // reporting on it afterwards.
    expect((await runtime.query("SELECT id FROM action_applications WHERE action_id=$1", [action])).rows).toHaveLength(1);
  });

  it("reports a genuinely closed action as closed, not duplicate", async () => {
    const { ws, user, action } = await seed("dismissed");
    const outcome = await applicationRepository(runtime).assertApplied(
      { workspace_id: ws, action_id: action, output_version_id: null, source: "owner_asserted", asserted_by: user, note: null, evidence: null },
      new Date().toISOString(),
    );
    expect(outcome).toEqual({ ok: false, reason: "closed" });
  });

  it("retraction stamps EVERY live owner assertion, not just the newest", async () => {
    // The bug this prevents: retract the newest only, an older live assertion
    // survives, strongestBasis keeps returning owner_asserted, and the product
    // goes on crediting work the owner explicitly withdrew.
    const { ws, user, action } = await seed();
    const repo = applicationRepository(runtime);
    // Two live assertions require two DIFFERENT versions -- the same-version
    // guard from the test above is what stops a same-version duplicate.
    const v1 = await approvedVersion(ws, action);
    const v2 = await approvedVersion(ws, action);
    const base = { workspace_id: ws, action_id: action, source: "owner_asserted" as const, asserted_by: user, note: null, evidence: null };
    expect((await repo.assertApplied({ ...base, output_version_id: v1 }, new Date().toISOString())).ok).toBe(true);
    expect((await repo.assertApplied({ ...base, output_version_id: v2 }, new Date().toISOString())).ok).toBe(true);

    expect(await repo.retract(ws, action, user, new Date().toISOString())).toEqual({ retracted: 2 });
    expect(await repo.forActions(ws, [action])).toEqual([]);
    expect((await runtime.query("SELECT retracted_at FROM action_applications WHERE action_id=$1", [action])).rows.every((r) => r.retracted_at !== null)).toBe(true);
  });

  it("the sme_app_runtime grant from 0006 actually took", async () => {
    // 0003 holds the grants for existing tables and is immutable, so a 0006
    // that forgot its own GRANT would leave this table unreachable at runtime
    // while every unit test still passed.
    const { ws, user, action } = await seed();
    await expect(
      applicationRepository(runtime).insert({ workspace_id: ws, action_id: action, output_version_id: null, source: "verified", asserted_by: user, note: null, evidence: { check: "faq_schema" } }),
    ).resolves.not.toBeNull();
  });

  it("a second concurrent verified insert for the same action is a no-op, not a duplicate evidence row", async () => {
    // Two overlapping cron ticks select the same eligible action and both
    // reach 'verified'. Append-only evidence must not grow a second row for
    // one observation; the guard is in-statement, so the loser returns null.
    const { ws, action } = await seed();
    const repo = applicationRepository(runtime);
    const row = { workspace_id: ws, action_id: action, output_version_id: null, source: "verified" as const, asserted_by: null, note: null, evidence: { check: "faq_schema" } };
    // Sequential, not Promise.all: the guard is a NOT EXISTS inside the
    // statement, not a unique index, so two genuinely simultaneous inserts
    // under READ COMMITTED could still both see an empty table. What this
    // pins is the overwhelmingly common case -- a later tick finding the row
    // the earlier one wrote -- deterministically.
    expect(await repo.insert(row)).not.toBeNull();
    expect(await repo.insert(row)).toBeNull();
    expect((await runtime.query("SELECT id FROM action_applications WHERE action_id=$1 AND source='verified'", [action])).rows).toHaveLength(1);
  });
});
