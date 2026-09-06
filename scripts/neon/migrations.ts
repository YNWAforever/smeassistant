import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { Pool } from "pg";

export interface Migration { name: string; sql: string }
export async function loadMigrations(): Promise<Migration[]> {
  const directory = new URL("../../neon/migrations/", import.meta.url);
  const names = (await readdir(directory)).filter(name => name.endsWith(".sql")).sort();
  return Promise.all(names.map(async name => ({ name, sql: await readFile(new URL(name, directory), "utf8") })));
}

/** Owner-only runner. One locked transaction covers DDL and its immutable journal. */
export async function applyMigrations(pool: Pool, migrations?: Migration[]): Promise<string[]> {
  const ordered = migrations ?? await loadMigrations();
  if (!ordered.length || ordered.some((entry, i) => !/^\d{4}_[a-z0-9_]+\.sql$/.test(entry.name) || (i > 0 && entry.name <= ordered[i - 1].name))) {
    throw new Error("migration_order_invalid");
  }
  const checksums = ordered.map(entry => createHash("sha256").update(entry.sql).digest("hex"));
  const client = await pool.connect();
  let destroy = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(1936549221, 3)");
    await client.query(`CREATE SCHEMA IF NOT EXISTS neon_migrations;
      REVOKE ALL ON SCHEMA neon_migrations FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS neon_migrations.journal (
        ordinal integer PRIMARY KEY, name text NOT NULL UNIQUE,
        checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT now()
      ); REVOKE ALL ON neon_migrations.journal FROM PUBLIC`);
    const history = (await client.query<{ordinal:number;name:string;checksum:string}>("SELECT ordinal,name,checksum FROM neon_migrations.journal ORDER BY ordinal")).rows;
    if (history.length > ordered.length || history.some((entry, i) => entry.ordinal !== i + 1 || entry.name !== ordered[i]?.name)) throw new Error("migration_history_mismatch");
    if (history.some((entry, i) => entry.checksum !== checksums[i])) throw new Error("migration_checksum_mismatch");
    const applied: string[] = [];
    for (let i = history.length; i < ordered.length; i++) {
      await client.query(ordered[i].sql);
      await client.query("INSERT INTO neon_migrations.journal(ordinal,name,checksum) VALUES($1,$2,$3)", [i + 1, ordered[i].name, checksums[i]]);
      applied.push(ordered[i].name);
    }
    await client.query("COMMIT");
    return applied;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { destroy = true; }
    throw error;
  } finally { client.release(destroy); }
}
