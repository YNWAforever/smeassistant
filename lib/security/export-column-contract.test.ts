import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPORT_COLUMNS } from "@/lib/lifecycle/export-columns";

/**
 * Every column the subject-access export asks for must exist in the schema.
 *
 * This exists because a mocked PostgREST builder cannot catch a wrong column
 * name, and every route test in this repo uses one. The fakes resolve
 * `{ data, error: null }` without ever inspecting the string passed to
 * `.select()`, so `select("id, status")` and `select("id, collection_status")`
 * are indistinguishable to them — while PostgREST rejects the whole query for the
 * first and the route returns 500 for every caller.
 *
 * That is not hypothetical: `report_evidence` has `collection_status`, the export
 * shipped asking for `status`, ten green route tests said nothing, and every
 * export would have failed in production.
 *
 * The schema is parsed from the migration corpus rather than a live database
 * because migrations here are applied by hand with no CLI step — the corpus is
 * the only machine-readable description of the schema this repo has.
 */

const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

const files = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const COLUMN_TYPES = "uuid|text|boolean|integer|int|bigserial|numeric|jsonb|timestamptz";

/** Map of table → column names, accumulated across create-table and add-column. */
function schemaColumns(): Map<string, Set<string>> {
  const schema = new Map<string, Set<string>>();
  const add = (table: string, column: string) => {
    const key = table.toLowerCase();
    if (!schema.has(key)) schema.set(key, new Set());
    schema.get(key)!.add(column.toLowerCase());
  };

  for (const name of files) {
    // Comments first, for the reason documented in migration-hardening-sweep.test.ts.
    const sql = readFileSync(join(MIGRATIONS_DIR, name), "utf8").replace(/--[^\n]*/g, " ");

    for (const block of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\s*\);/gi)) {
      for (const column of block[2]!.matchAll(new RegExp(String.raw`^\s*(\w+)\s+(?:${COLUMN_TYPES})\b`, "gim"))) {
        add(block[1]!, column[1]!);
      }
    }

    for (const statement of sql.matchAll(/alter\s+table\s+(?:public\.)?(\w+)([\s\S]*?);/gi)) {
      for (const column of statement[2]!.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi)) {
        add(statement[1]!, column[1]!);
      }
    }
  }

  return schema;
}

const schema = schemaColumns();

describe("subject-access export column contract", () => {
  it("parses a schema worth checking against", () => {
    // Guards the parser: an empty or shallow map would make every assertion below
    // vacuously pass, which is the failure mode this whole file exists to prevent.
    expect(files.length).toBeGreaterThan(0);
    expect(schema.get("report_evidence")?.has("collection_status")).toBe(true);
    expect(schema.get("audit_jobs")?.has("business_name")).toBe(true);
    expect(schema.get("leads")?.has("contact_identifier")).toBe(true);
  });

  it("actually has column lists to check", () => {
    // it.each over an empty object runs zero cases and the suite still passes.
    // Emptying EXPORT_COLUMNS must fail loudly, not silently disable the contract.
    expect(Object.keys(EXPORT_COLUMNS).sort()).toEqual([
      "audit_findings", "audit_jobs", "consent_records",
      "leads", "report_access_grants", "report_evidence",
    ]);
  });

  it("knows that report_evidence has no column called `status`", () => {
    // The exact mistake this file was written for. If a future migration adds a
    // `status` column the assertion below becomes wrong rather than merely
    // redundant, and should be deleted deliberately.
    expect(schema.get("report_evidence")?.has("status")).toBe(false);
  });

  it.each(Object.entries(EXPORT_COLUMNS))("selects only real columns from %s", (table, columns) => {
    const known = schema.get(table);
    expect(known, `no table named ${table} in the migration corpus`).toBeDefined();

    const missing = columns
      .split(",")
      .map((column) => column.trim().toLowerCase())
      .filter((column) => column.length > 0 && !known!.has(column));

    expect(missing, `${table} has no column(s) ${missing.join(", ")} — PostgREST rejects the whole query`).toEqual([]);
  });
});
