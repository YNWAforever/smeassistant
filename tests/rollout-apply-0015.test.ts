import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadMigrations } from "../scripts/neon/migrations";

// The rollout statement is pasted into the Neon SQL Editor by hand. If its embedded
// migration text or journal checksums drift from neon/migrations, the repository
// runner later refuses the hosted journal with migration_checksum_mismatch.
const statement = readFileSync(
  fileURLToPath(new URL("../docs/implementation/owner-platform-v1/rollout/apply-0015.sql", import.meta.url)),
  "utf8",
);
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

describe("rollout/apply-0015.sql", () => {
  it("embeds 0015_action_list_indexes.sql byte for byte", async () => {
    const migrations = await loadMigrations();
    const m0015 = migrations.find((m) => m.name === "0015_action_list_indexes.sql");
    const embedded = statement.split("EXECUTE $m0015$")[1]?.split("$m0015$;")[0];
    expect(embedded).toBe(m0015?.sql);
  });

  it("expects exactly journal 0001-0014 with the on-disk checksums", async () => {
    const migrations = (await loadMigrations()).slice(0, 14);
    expect(migrations.at(-1)?.name).toBe("0014_publish_reply.sql");
    const block = statement.split("expected CONSTANT text[] := ARRAY[")[1]?.split("];")[0] ?? "";
    const listed = [...block.matchAll(/'(\d+ \S+ [a-f0-9]{64})'/g)].map((match) => match[1]);
    expect(listed).toEqual(migrations.map((m, i) => `${i + 1} ${m.name} ${sha256(m.sql)}`));
  });

  it("records journal row 15 with the on-disk checksum", async () => {
    const m0015 = (await loadMigrations())[14];
    expect(m0015.name).toBe("0015_action_list_indexes.sql");
    expect(statement).toContain(`VALUES (15, '${m0015.name}', '${sha256(m0015.sql)}')`);
  });

  it("checks every index 0015 creates", async () => {
    const m0015 = (await loadMigrations())[14];
    const created = [...m0015.sql.matchAll(/CREATE INDEX IF NOT EXISTS (\w+)/g)].map((match) => match[1]);
    expect(created).toHaveLength(3);
    for (const name of created) expect(statement).toContain(`ARRAY['${name}', `);
  });
});
