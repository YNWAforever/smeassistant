import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";

// Offline schema compatibility only. This does not execute SQL, validate
// PostgreSQL parameter inference, or replace the owned-container acceptance.
const sources = [
  "scripts/owner-check-isolated.ts",
  "test/e2e/seed.ts",
  "test/integration/owner-check-seed.ts",
  "test/integration/owner-check-real.acceptance.ts",
].filter(file => existsSync(resolve(file)));
const tables = new Map<string, PgTable>(Object.values(schema)
  .filter(value => is(value, PgTable))
  .map(table => [getTableName(table), table] as const));
const inserts = sources.flatMap(file => [...readFileSync(resolve(file), "utf8")
  .matchAll(/\binsert\s+into\s+([a-z_]+)\s*\(([^)]+)\)/gi)]
  .map(match => ({ file, table: match[1], columns: match[2].split(",").map(name => name.trim()) })));

describe("owner-check synthetic seed follows the current authored schema", () => {
  it("only inserts into known schema tables and column names", () => {
    expect(inserts.length).toBeGreaterThan(10);
    for (const insert of inserts) {
      const table = tables.get(insert.table);
      expect(table, `${insert.file}: unknown table ${insert.table}`).toBeDefined();
      const known = new Set(Object.values(getTableColumns(table!)).map(column => column.name));
      expect(insert.columns.filter(column => !known.has(column)), `${insert.file}: ${insert.table}`).toEqual([]);
    }
  });

  it("supplies every NOT NULL column without a database default in every fixture INSERT", () => {
    const missing = inserts.flatMap(insert => Object.values(getTableColumns(tables.get(insert.table)!))
      .filter(column => column.notNull && !column.hasDefault && !insert.columns.includes(column.name))
      .map(column => `${insert.file}: ${insert.table}.${column.name}`));
    expect(missing).toEqual([]);
  });
});
