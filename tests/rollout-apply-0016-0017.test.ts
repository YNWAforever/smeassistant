import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadMigrations } from "../scripts/neon/migrations";

// The rollout statements are pasted into the Neon SQL Editor by hand. If their embedded
// migration text or journal checksums drift from neon/migrations, the repository
// runner later refuses the hosted journal with migration_checksum_mismatch.
const read = (name: string) => readFileSync(
  fileURLToPath(new URL(`../docs/implementation/owner-platform-v1/rollout/${name}`, import.meta.url)),
  "utf8",
);
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

describe.each([
  { ordinal: 16, file: "apply-0016.sql", name: "0016_brand_revisions.sql" },
  { ordinal: 17, file: "apply-0017.sql", name: "0017_brand_profile_revision_capture.sql" },
])("rollout/$file", ({ ordinal, file, name }) => {
  const statement = read(file);
  const tag = `$m${String(ordinal).padStart(4, "0")}$`;

  it(`embeds ${name} byte for byte`, async () => {
    const migration = (await loadMigrations())[ordinal - 1];
    expect(migration.name).toBe(name);
    const embedded = statement.split(`EXECUTE ${tag}`)[1]?.split(`${tag};`)[0];
    expect(embedded).toBe(migration.sql);
  });

  it(`expects exactly journal 1-${ordinal - 1} with the on-disk checksums`, async () => {
    const migrations = (await loadMigrations()).slice(0, ordinal - 1);
    const block = statement.split("expected CONSTANT text[] := ARRAY[")[1]?.split("];")[0] ?? "";
    const listed = [...block.matchAll(/'(\d+ \S+ [a-f0-9]{64})'/g)].map((match) => match[1]);
    expect(listed).toEqual(migrations.map((m, i) => `${i + 1} ${m.name} ${sha256(m.sql)}`));
  });

  it(`records journal row ${ordinal} with the on-disk checksum`, async () => {
    const migration = (await loadMigrations())[ordinal - 1];
    expect(statement).toContain(`VALUES (${ordinal}, '${migration.name}', '${sha256(migration.sql)}')`);
  });

  it("runs as the migrator under the runner's advisory lock", () => {
    expect(statement).toContain("SET LOCAL ROLE smeassistant_migrator;");
    expect(statement).toContain("PERFORM pg_advisory_xact_lock(1936549221, 3);");
  });
});

describe("rollout/apply-0016.sql and apply-0017.sql together", () => {
  it("check every function the two migrations grant to the runtime role", async () => {
    const migrations = await loadMigrations();
    const statements = read("apply-0016.sql") + read("apply-0017.sql");
    for (const m of migrations.slice(15, 17)) {
      const granted = [...m.sql.matchAll(/GRANT EXECUTE ON FUNCTION (public\.\w+\([^)]*\))/g)].map((match) => match[1]);
      expect(granted.length).toBeGreaterThan(0);
      for (const fn of granted) expect(statements).toContain(`has_function_privilege('sme_app_runtime', '${fn}', 'EXECUTE')`);
    }
  });
});
