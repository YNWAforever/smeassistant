import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { assignmentUpdateService } from "../../lib/workspace/bulk-action-updates";
const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock("../../lib/db/client", () => ({ getPool: () => ports.pool }));
const stamp = `to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
describe.runIf(process.env.NEON_INTEGRATION === "1")("atomic scoped assignment updates (T-13)", () => {
  let fixture: NeonDatabaseFixture, owner: Pool, runtime: Pool;
  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl, connectionTimeoutMillis: 10_000 });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl); url.username = "fixture_runtime"; url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href, connectionTimeoutMillis: 10_000 }); ports.pool = runtime;
  });
  beforeEach(async () => { await runtime.query("DELETE FROM audit_events; DELETE FROM workspaces; DELETE FROM app_users"); });
  afterAll(async () => { await Promise.allSettled([owner?.end(), runtime?.end()]); fixture?.stop(); });
  async function seed() {
    const workspaceId = (await runtime.query("INSERT INTO workspaces(slug,market,timezone) VALUES('bulk','hk','Asia/Hong_Kong') RETURNING id")).rows[0].id;
    const locations = (await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'allowed','Allowed'),($1,'hidden','Hidden') RETURNING id,slug", [workspaceId])).rows;
    const allowed = locations.find(r => r.slug === "allowed")!.id, hidden = locations.find(r => r.slug === "hidden")!.id;
    const users = (await runtime.query("INSERT INTO app_users(email) VALUES('owner@example.test'),('manager@example.test'),('viewer@example.test'),('invited@example.test'),('other@example.test') RETURNING id,email")).rows;
    const user = (kind: string) => users.find(r => r.email === `${kind}@example.test`)!.id as string;
    for (const [kind, role, loc, accepted] of [["owner", "owner", null, true], ["manager", "manager", [allowed], true], ["viewer", "viewer", null, true], ["invited", "manager", null, false], ["other", "manager", [hidden], true]] as const) {
      await runtime.query("INSERT INTO workspace_members(workspace_id,user_id,email,role,location_scope,accepted_at) VALUES($1,$2,$3,$4,$5,CASE WHEN $6 THEN now() ELSE NULL END)", [workspaceId, user(kind), `${kind}@example.test`, role, loc, accepted]);
    }
    const rows: Array<{ actionId: string; expectedUpdatedAt: string }> = [];
    for (let i = 0; i < 4; i++) {
      const row = (await runtime.query(`INSERT INTO actions(workspace_id,location_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,updated_at) VALUES($1,$2,'review-response','{}','{}','{}','high',50,'[]',10,'Live',$3,'2026-10-01T00:00:00.123456Z') RETURNING id,${stamp} AS updated_at`, [workspaceId, i === 1 ? null : i === 2 ? hidden : allowed, String(i)])).rows[0];
      rows.push({ actionId: row.id, expectedUpdatedAt: row.updated_at });
    }
    return { workspaceId, user, allowed, hidden, rows, actor: { workspaceId, userId: user("manager"), locale: "zh-HK" } };
  }
  const events = async () => Number((await runtime.query("SELECT count(*) AS count FROM audit_events WHERE event='action.updated'")).rows[0].count);
  it("reports two updates, one scope denial and one conflict; retries do not replay successful events", async () => {
    const { actor, rows } = await seed(); const service = assignmentUpdateService(runtime);
    const input = { mode: "preview" as const, items: rows, patch: { due_at: "2026-10-12T09:00:00+08:00" } };
    expect((await service.bulk(actor, input)).map(r => r.status)).toEqual(["updated", "updated", "forbidden", "updated"]);
    expect(await events()).toBe(0);
    await runtime.query("UPDATE actions SET updated_at=clock_timestamp() WHERE id=$1", [rows[3].actionId]);
    expect((await service.bulk(actor, { ...input, mode: "apply" })).map(r => r.status)).toEqual(["updated", "updated", "forbidden", "conflict"]);
    expect(await events()).toBe(2);
    // Unknown result recovery can safely read/preview the old desired set: already-set values cause no event.
    expect((await service.bulk(actor, { ...input, mode: "apply" })).map(r => r.status)).toEqual(["no_change", "no_change", "forbidden", "conflict"]);
    expect(await events()).toBe(2);
    const fresh = (await runtime.query(`SELECT ${stamp} AS updated_at FROM actions WHERE id=$1`, [rows[3].actionId])).rows[0].updated_at;
    expect((await service.bulk(actor, { ...input, mode: "apply", items: [{ ...rows[3], expectedUpdatedAt: fresh }] }))[0].status).toBe("updated");
    expect(await events()).toBe(3);
  });
  it("rejects viewer, revoked actor and ineligible/pending/out-of-scope assignees", async () => {
    const { actor, user, rows } = await seed(); const service = assignmentUpdateService(runtime);
    expect((await service.item({ ...actor, userId: user("viewer") }, rows[0], { due_at: null }, "apply")).status).toBe("forbidden");
    for (const target of ["invited", "viewer", "other"]) expect((await service.item(actor, rows[0], { assignee_user_id: user(target) }, "preview")).reason).toBe("assignee_ineligible");
    expect((await service.item(actor, rows[0], { assignee_user_id: user("owner") }, "preview")).eligible).toBe(true);
    await runtime.query("UPDATE workspace_members SET role='viewer' WHERE workspace_id=$1 AND user_id=$2", [actor.workspaceId, actor.userId]);
    expect((await service.item(actor, rows[0], { assignee_user_id: user("owner") }, "apply")).status).toBe("forbidden");
    expect(await events()).toBe(0);
  });
  it("returns the same detail-free not_found for deleted and foreign action UUIDs; refuses closed actions", async () => {
    const { actor, rows } = await seed(); const service = assignmentUpdateService(runtime);
    const other = (await runtime.query("INSERT INTO workspaces(slug,market,timezone) VALUES('other','hk','UTC') RETURNING id")).rows[0].id;
    await runtime.query("UPDATE actions SET workspace_id=$2,location_id=NULL WHERE id=$1", [rows[0].actionId, other]);
    await runtime.query("DELETE FROM actions WHERE id=$1", [rows[1].actionId]);
    for (const selection of rows.slice(0, 2)) expect(await service.item(actor, selection, { due_at: null }, "apply")).toEqual({ actionId: selection.actionId, status: "not_found", eligible: false });
    await runtime.query("UPDATE actions SET action_state='completed' WHERE id=$1", [rows[3].actionId]);
    expect((await service.item(actor, rows[3], { due_at: null }, "apply")).reason).toBe("action_closed");
    expect(await events()).toBe(0);
  });
  it("rolls back the action when the same-transaction audit insert fails", async () => {
    const { actor, rows } = await seed(); const service = assignmentUpdateService(runtime);
    await owner.query("CREATE FUNCTION fixture_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$; CREATE TRIGGER fixture_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fixture_audit_failure()");
    try {
      expect((await service.item(actor, rows[0], { due_at: "2026-10-12T09:00:00Z" }, "apply")).status).toBe("failed");
      const row = (await runtime.query(`SELECT due_at,${stamp} AS updated_at FROM actions WHERE id=$1`, [rows[0].actionId])).rows[0];
      expect(row.due_at).toBeNull(); expect(row.updated_at).toBe(rows[0].expectedUpdatedAt); expect(await events()).toBe(0);
    } finally { await owner.query("DROP TRIGGER fixture_audit_failure ON audit_events; DROP FUNCTION fixture_audit_failure()"); }
  });
  it("bounds a real row-lock wait and remains retryable without a partial audit", async () => {
    const { actor, rows } = await seed(); const lock = await owner.connect();
    try {
      await lock.query("BEGIN"); await lock.query("SELECT id FROM actions WHERE id=$1 FOR UPDATE", [rows[0].actionId]);
      const start = performance.now();
      expect((await assignmentUpdateService(runtime).item(actor, rows[0], { due_at: "2026-10-12T09:00:00Z" }, "apply")).status).toBe("failed");
      expect(performance.now() - start).toBeLessThan(4000); expect(await events()).toBe(0);
      await lock.query("ROLLBACK");
      expect((await assignmentUpdateService(runtime).item(actor, rows[0], { due_at: "2026-10-12T09:00:00Z" }, "apply")).status).toBe("updated");
      expect(await events()).toBe(1);
    } finally { await lock.query("ROLLBACK"); lock.release(); }
  });
});
