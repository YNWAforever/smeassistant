import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { catalogQueries, verifyCatalog } from "../../scripts/neon/catalog";
import { applyMigrations, loadMigrations, type Migration } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";

describe("catalog comparison across checkout line endings", () => {
  let fixture: NeonDatabaseFixture | undefined;
  let owner: Pool;
  let migrations: Migration[];
  let definitions: Array<{ name: string; definition: string }>;

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
    // Reproduce a fresh Linux checkout in memory; never rewrite migration files.
    migrations = (await loadMigrations()).map(row => ({ ...row, sql: row.sql.replaceAll("\r\n", "\n") }));
    await applyMigrations(owner, migrations);
    definitions = (await owner.query(catalogQueries.functions)).rows;
  });
  afterAll(async () => { try { await owner?.end(); } finally { fixture?.stop(); } });

  it("accepts LF migration output against the independently captured mixed-ending legacy catalog", async () => {
    await expect(verifyCatalog(owner)).resolves.toMatchObject({ functions: 13, seededRows: 0 });
  });

  it("accepts CRLF function bodies without changing the catalog contract", async () => {
    try {
      for (const row of definitions) await owner.query(row.definition.replaceAll("\n", "\r\n"));
      await expect(verifyCatalog(owner)).resolves.toMatchObject({ functions: 13, seededRows: 0 });
    } finally {
      for (const row of definitions) await owner.query(row.definition);
    }
  });

  async function rejectFunctionChange(change: (definition: string) => string) {
    const original = definitions.find(row => row.name === "touch_actions_updated_at")!.definition;
    const changed = change(original);
    expect(changed).not.toBe(original);
    try {
      await owner.query(changed);
      await expect(verifyCatalog(owner)).rejects.toThrow("retained function definitions with constrained search_path");
    } finally { await owner.query(original); }
  }

  it("still rejects security-definer changes", async () => {
    await rejectFunctionChange(def => def.replace(" LANGUAGE plpgsql\n", " LANGUAGE plpgsql\n SECURITY DEFINER\n"));
  });
  it("still rejects an unconstrained search path", async () => {
    await rejectFunctionChange(def => def.replace(" SET search_path TO ''", " SET search_path TO 'public'"));
  });
  it("still rejects changed function behavior", async () => {
    await rejectFunctionChange(def => def.replace("now()", "clock_timestamp()"));
  });
  it("does not erase other whitespace differences", async () => {
    await rejectFunctionChange(def => def.replace("  return new;", "   return new;"));
  });
  it("still rejects PUBLIC execution grants", async () => {
    try {
      await owner.query("GRANT EXECUTE ON FUNCTION public.touch_actions_updated_at() TO PUBLIC");
      await expect(verifyCatalog(owner)).rejects.toThrow("no PUBLIC function execution");
    } finally { await owner.query("REVOKE EXECUTE ON FUNCTION public.touch_actions_updated_at() FROM PUBLIC"); }
  });
  it("keeps migration checksums byte-sensitive", async () => {
    const changed = migrations.map((row, i) => i === 0 ? { ...row, sql: row.sql.replaceAll("\n", "\r\n") } : row);
    await expect(applyMigrations(owner, changed)).rejects.toThrow("migration_checksum_mismatch");
    await expect(applyMigrations(owner, migrations)).resolves.toEqual([]);
  });
});
