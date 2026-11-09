import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, loadMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";

/**
 * Executes the prepared apply-0022 rollout against an owned PostgreSQL fixture
 * after journal 1-21. Proves the embedded migration, journal/checksum guard,
 * post-checks and row-22 recording work as one statement, and that the normal
 * runner then sees a complete journal and replays as a no-op.
 */
describe.runIf(process.env.NEON_INTEGRATION === "1")("rollout/apply-0022.sql on a disposable fixture", () => {
  let fixture: NeonDatabaseFixture;
  let pool: Pool;
  const statement = readFileSync(
    fileURLToPath(new URL("../../docs/implementation/owner-platform-v1/rollout/apply-0022.sql", import.meta.url)),
    "utf8",
  );

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    pool = new Pool({ connectionString: fixture.databaseUrl });
    const owner = (await pool.query<{ u: string }>("SELECT current_user AS u")).rows[0].u;
    await pool.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
    await pool.query("CREATE ROLE smeassistant_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
    await pool.query(`GRANT smeassistant_migrator TO "${owner.replaceAll('"', '""')}" WITH SET TRUE`);
    const migrations = await loadMigrations();
    expect(await applyMigrations(pool, migrations.slice(0, 21))).toEqual(migrations.slice(0, 21).map((migration) => migration.name));
    // The hosted migrator can read the journal and create objects; mirror that
    // in the fixture after the 1-21 journal exists.
    await pool.query("GRANT USAGE ON SCHEMA neon_migrations TO smeassistant_migrator");
    await pool.query("GRANT SELECT, INSERT ON neon_migrations.journal TO smeassistant_migrator");
    await pool.query("GRANT USAGE, CREATE ON SCHEMA public TO smeassistant_migrator");
    await pool.query("GRANT REFERENCES ON public.app_users, public.workspaces, public.locations, public.studio_conversations TO smeassistant_migrator");
  });

  afterAll(async () => {
    await pool?.end();
    fixture?.stop();
  });

  it("applies 0022 once, records row 22 and leaves the runner a complete journal", async () => {
    await pool.query(statement);
    const journal = (await pool.query<{ ordinal: number; name: string }>("SELECT ordinal,name FROM neon_migrations.journal ORDER BY ordinal")).rows;
    expect(journal.at(-1)).toEqual({ ordinal: 22, name: "0022_studio_conversation_members.sql" });
    const table = (await pool.query<{ rls: boolean }>(
      "SELECT relrowsecurity AS rls FROM pg_class WHERE oid='public.studio_conversation_members'::regclass",
    )).rows[0];
    expect(table.rls).toBe(true);
    const policy = (await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='public' AND tablename='studio_conversation_members' AND policyname='server_application'",
    )).rows[0];
    expect(policy.n).toBe(1);
    // The normal runner now sees the full history and replays as a no-op.
    expect(await applyMigrations(pool)).toEqual([]);
  });

  it("refuses a second execution because the journal is no longer 1-21", async () => {
    await expect(pool.query(statement)).rejects.toThrow(/journal is not exactly 0001-0021/);
    expect((await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM neon_migrations.journal")).rows[0].n).toBe(22);
  });
});
