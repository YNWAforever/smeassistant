import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../../lib/db/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, loadMigrations } from "../../scripts/neon/migrations";
import { verifyCatalog } from "../../scripts/neon/catalog";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";

describe.runIf(process.env.NEON_INTEGRATION === "1")("fresh application schema", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;
  let denied: Pool;
  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime; CREATE ROLE fixture_denied LOGIN PASSWORD 'fixture-only'");
    const loginUrl = (username: string) => { const url = new URL(fixture.databaseUrl); url.username = username; url.password = "fixture-only"; return url.href; };
    runtime = new Pool({ connectionString: loginUrl("fixture_runtime") });
    denied = new Pool({ connectionString: loginUrl("fixture_denied") });
  });
  afterAll(async () => { await Promise.all([owner?.end(), runtime?.end(), denied?.end()]); fixture?.stop(); });

  it("applies all final business objects to empty PostgreSQL with no business seeds", async () => {
    expect(await applyMigrations(owner)).toEqual(["0001_identity.sql", "0002_business.sql", "0003_workflows.sql", "0004_atomic_operations.sql"]);
    expect(await verifyCatalog(owner)).toMatchObject({ tables: 34, columns: 403, constraints: 151, indexes: 84, triggers: 7, functions: 13, seededRows: 0 });
    expect((await owner.query("SELECT nspname FROM pg_namespace WHERE nspname IN ('auth','storage','neon_auth')")).rows).toEqual([]);
  });
  it("replays as a no-op and rejects changed, missing, and reordered history", async () => {
    expect(await applyMigrations(owner)).toEqual([]);
    const migrations = await loadMigrations();
    await expect(applyMigrations(owner, [{ ...migrations[0], sql: migrations[0].sql + "\n-- changed" }, ...migrations.slice(1)])).rejects.toThrow("migration_checksum_mismatch");
    await expect(applyMigrations(owner, migrations.slice(0, 2))).rejects.toThrow("migration_history_mismatch");
    await expect(applyMigrations(owner, [...migrations].reverse())).rejects.toThrow("migration_order_invalid");
    expect((await owner.query("SELECT count(*)::int AS n FROM neon_migrations.journal")).rows[0].n).toBe(4);
  });
  it("rolls back interrupted DDL and journal together, then permits retry", async () => {
    const migrations = await loadMigrations();
    await expect(applyMigrations(owner, [...migrations, { name: "0005_probe.sql", sql: "CREATE TABLE public.interruption_probe(id integer); SELECT 1/0;" }])).rejects.toThrow();
    expect((await owner.query("SELECT to_regclass('public.interruption_probe') AS relation")).rows[0].relation).toBeNull();
    expect((await owner.query("SELECT count(*)::int AS n FROM neon_migrations.journal")).rows[0].n).toBe(4);
    expect(await applyMigrations(owner)).toEqual([]);
  });
  it("rolls back a cancelled in-flight migration before a clean retry", async () => {
    const migrations = await loadMigrations();
    const running = applyMigrations(owner, [...migrations, {name:"0005_cancel.sql", sql:"CREATE TABLE public.cancel_probe(id int); SELECT pg_sleep(30) /* task3_cancel */;"}]);
    // Attach immediately so cancellation cannot become an unhandled rejection.
    const result = running.then(() => "unexpected_success", error => (error as {code:string}).code);
    let pid: number | undefined;
    for (let attempt=0; attempt<100 && !pid; attempt++) {
      pid = (await owner.query("SELECT pid FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND query LIKE '%pg_sleep(30) /* task3_cancel */%' AND state='active'")).rows[0]?.pid;
      if (!pid) await new Promise(resolve => setTimeout(resolve,20));
    }
    expect(pid).toBeTypeOf("number");
    await owner.query("SELECT pg_cancel_backend($1)", [pid]);
    expect(await result).toBe("57014");
    expect((await owner.query("SELECT to_regclass('public.cancel_probe') AS relation")).rows[0].relation).toBeNull();
    expect(await applyMigrations(owner)).toEqual([]);
  });
  it("exposes all final columns and constraints through typed Drizzle tables", async () => {
    const oracle = JSON.parse(await readFile(new URL("./fixtures/legacy-final-catalog.json", import.meta.url), "utf8"));
    const tables = Object.values(schema).map(table => getTableConfig(table));
    expect(tables.length).toBe(36);
    for (const expected of oracle.tables as Array<{name:string}>) {
      const table = tables.find(table => table.name === expected.name)!;
      expect(table, expected.name).toBeDefined();
      const columns = oracle.columns.filter((column: {table_name:string}) => column.table_name === expected.name);
      expect(table.columns.map(column => ({name:column.name,notNull:column.notNull}))).toEqual(columns.map((column:{column_name:string;is_nullable:string}) => ({name:column.column_name,notNull:column.is_nullable === "NO"})));
      const constraints = [...table.primaryKeys.map(c=>c.getName()), ...table.uniqueConstraints.map(c=>c.getName()), ...table.foreignKeys.map(c=>c.getName()), ...table.checks.map(c=>c.name)].sort();
      expect(constraints).toEqual(oracle.constraints.filter((c:{table_name:string})=>c.table_name===expected.name).map((c:{name:string})=>c.name).sort());
      expect(table.enableRLS).toBe(true);
    }
  });
  it("uses a real non-owner runtime role with explicit server-only policies and rejects unrelated roles", async () => {
    const role = (await runtime.query("SELECT current_user AS name, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=current_user")).rows[0];
    expect(role).toMatchObject({ name: "fixture_runtime", rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false });
    expect((await runtime.query("SELECT count(*)::int AS n FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)")).rows[0].n).toBe(0);
    const user = (await runtime.query("INSERT INTO app_users(email) VALUES ('same@example.test') RETURNING id")).rows[0].id;
    await runtime.query("INSERT INTO app_users(email) VALUES ('same@example.test')");
    await runtime.query("INSERT INTO auth_identities(provider,subject,user_id) VALUES ('neon','subject-1',$1)", [user]);
    expect((await runtime.query("SELECT count(*)::int AS n FROM app_users")).rows[0].n).toBe(2);
    await expect(runtime.query("INSERT INTO auth_identities VALUES ('other','subject-2',$1)", [user])).rejects.toMatchObject({ code: "23514" });
    await expect(runtime.query("INSERT INTO auth_identities VALUES ('neon','subject-1',$1)", [user])).rejects.toMatchObject({ code: "23505" });
    await runtime.query("DELETE FROM app_users WHERE id=$1", [user]);
    expect((await runtime.query("SELECT count(*)::int AS n FROM auth_identities")).rows[0].n).toBe(0);
    await expect(runtime.query("CREATE TABLE public.forbidden(id int)")).rejects.toMatchObject({ code: "42501" });
    await expect(runtime.query("ALTER TABLE app_users ADD COLUMN forbidden text")).rejects.toMatchObject({ code: "42501" });
    await expect(runtime.query("TRUNCATE app_users CASCADE")).rejects.toMatchObject({ code: "42501" });
    await expect(runtime.query("SELECT * FROM neon_migrations.journal")).rejects.toMatchObject({ code: "42501" });
    await expect(denied.query("SELECT * FROM app_users")).rejects.toMatchObject({ code: "42501" });
    // Even accidental table grants cannot bypass the role-targeted policies.
    await owner.query("GRANT USAGE ON SCHEMA public TO fixture_denied; GRANT SELECT, INSERT ON app_users TO fixture_denied");
    expect((await denied.query("SELECT * FROM app_users")).rows).toEqual([]);
    await expect(denied.query("INSERT INTO app_users(email) VALUES ('denied@example.test')")).rejects.toMatchObject({ code: "42501" });
    for (const table of Object.values(schema).map(table => getTableConfig(table))) {
      await runtime.query(`SELECT * FROM public."${table.name}" LIMIT 1`);
    }
    await runtime.query("DELETE FROM app_users");
  });
  it("retains member cleanup and update-time invariants under runtime RLS", async () => {
    const user = (await runtime.query("INSERT INTO app_users(email) VALUES ('member@example.test') RETURNING id")).rows[0].id;
    const workspace = (await runtime.query("INSERT INTO workspaces DEFAULT VALUES RETURNING id")).rows[0].id;
    await runtime.query("INSERT INTO workspace_members(workspace_id,user_id,email,role) VALUES($1,$2,'member@example.test','owner')", [workspace,user]);
    const action = (await runtime.query(`INSERT INTO actions(workspace_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,updated_at)
      VALUES($1,'fixture','{}','{}','[]','low',1,'{}',5,'Live','fixture-dedupe','2000-01-01') RETURNING id`, [workspace])).rows[0].id;
    const updated = (await runtime.query("UPDATE actions SET due_at=now() WHERE id=$1 RETURNING updated_at > '2000-01-02'::timestamptz AS touched", [action])).rows[0];
    expect(updated.touched).toBe(true);
    await expect(runtime.query("UPDATE workspaces SET tier='undeclared' WHERE id=$1", [workspace])).rejects.toMatchObject({code:"23514"});
    await runtime.query("DELETE FROM app_users WHERE id=$1", [user]);
    expect((await runtime.query("SELECT id FROM workspaces WHERE id=$1", [workspace])).rows).toEqual([]);
  });
});
