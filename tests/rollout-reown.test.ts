import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadMigrations } from "../scripts/neon/migrations";

// The ownership transfer is pasted into the Neon SQL Editor by hand. It must only run on a
// journal at 0015, only touch the fifteen objects found on production, and change nothing else.
const statement = readFileSync(
  fileURLToPath(new URL("../docs/implementation/owner-platform-v1/rollout/reown-0009-0014-objects.sql", import.meta.url)),
  "utf8",
);
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const listed = (name: string) =>
  [...(statement.split(`${name} CONSTANT text[] := ARRAY[`)[1]?.split("];")[0] ?? "").matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1]);

const TABLES = ["mail_outbox", "offers", "preview_events", "scan_attempts", "work_pack_items", "work_packs"];

describe("rollout/reown-0009-0014-objects.sql", () => {
  it("requires exactly journal 0001-0015 with the on-disk checksums", async () => {
    const migrations = await loadMigrations();
    expect(migrations).toHaveLength(15);
    expect(listed("expected_journal")).toEqual(migrations.map((m, i) => `${i + 1} ${m.name} ${sha256(m.sql)}`));
  });

  it("transfers exactly the six tables and nine functions, and expects only those to be stray", () => {
    expect(listed("tables")).toEqual(TABLES);
    const functions = listed("functions");
    expect(functions).toHaveLength(9);
    expect(listed("expected_strays")).toEqual(
      [...TABLES.map((t) => `table ${t}`), ...functions.map((f) => `function ${f}`)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    );
  });

  it("changes ownership only", () => {
    const body = statement.split("DO $reown$")[1] ?? "";
    const ddl = [...body.matchAll(/\b(ALTER \w+|CREATE|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE)\b[^;\n]*/g)].map((m) => m[0]);
    expect(ddl).toEqual([
      "ALTER TABLE public.%I OWNER TO smeassistant_migrator', item)",
      "ALTER FUNCTION public.%s OWNER TO smeassistant_migrator', item)",
    ]);
    for (const category of ["columns", "constraints", "functions", "indexes", "runtime_grants", "tables", "triggers", "types"]) {
      expect(statement).toMatch(new RegExp(`ARRAY\\['${category}', '[a-f0-9]{32}'\\]`));
    }
  });
});
