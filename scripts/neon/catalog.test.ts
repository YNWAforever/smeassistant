import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { additionalFunctions, additionalIndexes, additionalTriggers, catalogQueries, changedFunctions, verifyCatalog } from "./catalog";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));

type Row = Record<string, unknown>;
const column = { table_name: "workspaces", column_name: "timezone", ordinal_position: 1, data_type: "text", udt_name: "text", is_nullable: "NO", column_default: null };
const check = { table_name: "workspaces", name: "workspaces_timezone_check", type: "c", definition: "CHECK ((timezone <> ''::text))" };
const legacy = { tables: [{ name: "workspaces", rls: true }], columns: [column], constraints: [check], indexes: [], triggers: [], functions: [], enums: [] };
const notNull = { table_name: "workspaces", column_name: "timezone", convalidated: true, conenforced: true, key_count: 1 };

function metadataPool(options: { version?: number; notNullRows?: Row[]; nullable?: boolean; changedCheck?: boolean } = {}) {
  const version = options.version ?? 180006;
  const metadata: Record<string, Row[]> = {
    tables: [...legacy.tables, { name: "app_users", rls: true }, { name: "auth_identities", rls: true }],
    columns: [{ ...column, is_nullable: options.nullable ? "YES" : "NO" }],
    constraints: [options.changedCheck ? { ...check, definition: "CHECK ((timezone <> 'UTC'::text))" } : check, ...(version >= 180000 ? [{ table_name: "workspaces", name: "workspaces_timezone_not_null", type: "n", definition: "NOT NULL timezone" }] : [])],
    indexes: additionalIndexes,
    triggers: additionalTriggers.map(name => ({ name })),
    functions: [...additionalFunctions, ...changedFunctions].map(name => ({ name })),
    enums: [],
  };
  const query = vi.fn(async (sql: string) => {
    const category = Object.entries(catalogQueries).find(([, value]) => value === sql)?.[0];
    let rows: Row[];
    if (category) rows = metadata[category];
    else if (sql.includes("server_version_num")) rows = [{ version }];
    else if (sql.includes("attnotnull")) rows = [{ table_name: "workspaces", column_name: "timezone" }];
    else if (sql.includes("k.contype='n'")) rows = options.notNullRows ?? [notNull];
    else if (sql.includes("FROM pg_policies")) rows = ["workspaces", "app_users", "auth_identities"].map(tablename => ({ tablename, roles: ["sme_app_runtime"], cmd: "ALL", qual: "true", with_check: "true" }));
    else if (sql.includes("role_table_grants") || sql.includes("aclexplode")) rows = [];
    else if (sql.startsWith("SELECT count(*) AS count FROM public.")) rows = [{ count: "0" }];
    else throw new Error(`Unexpected verifier query: ${sql}`);
    return { rows, rowCount: rows.length };
  });
  return { pool: { query } as unknown as Pool, query };
}

beforeEach(() => { vi.mocked(readFile).mockResolvedValue(JSON.stringify(legacy)); });

describe("T-19 PostgreSQL NOT NULL catalog compatibility", () => {
  it("accepts the unchanged PostgreSQL 16 representation", async () => {
    await expect(verifyCatalog(metadataPool({ version: 160014 }).pool)).resolves.toMatchObject({ constraints: 1, seededRows: 0 });
  });
  it("accepts PostgreSQL 18 only after validating its redundant NOT NULL metadata", async () => {
    await expect(verifyCatalog(metadataPool().pool)).resolves.toMatchObject({ constraints: 1, notNullConstraints: 1, seededRows: 0 });
  });
  it.each([
    ["missing constraint", []],
    ["unvalidated constraint", [{ ...notNull, convalidated: false }]],
    ["unenforced constraint", [{ ...notNull, conenforced: false }]],
    ["multi-column constraint", [{ ...notNull, key_count: 2 }]],
    ["wrong column", [{ ...notNull, column_name: "market" }]],
    ["duplicate constraint", [notNull, notNull]],
  ])("rejects PostgreSQL 18 %s instead of hiding it", async (_name, notNullRows) => {
    await expect(verifyCatalog(metadataPool({ notNullRows }).pool)).rejects.toThrow(/NOT NULL/);
  });
  it("still rejects relaxed column nullability", async () => {
    await expect(verifyCatalog(metadataPool({ nullable: true }).pool)).rejects.toThrow("all business columns/types/nullability/defaults");
  });
  it("still rejects changed ordinary constraints", async () => {
    await expect(verifyCatalog(metadataPool({ changedCheck: true }).pool)).rejects.toThrow("constraints and deletion semantics");
  });
});
