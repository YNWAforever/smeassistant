import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadMigrations } from "../scripts/neon/migrations";

// The rollout statements are pasted into the Neon SQL Editor by hand. If their embedded
// migration text or journal checksums drift from neon/migrations, the repository
// runner later refuses the hosted journal with migration_checksum_mismatch.
//
// apply-0022 is the Conversation Studio migration, layered on the 0019/0020
// conversation workstream. It requires the full 1-20 journal, embeds 0021 byte
// for byte and records row 21.
const read = (name: string) => readFileSync(
  fileURLToPath(new URL(`../docs/implementation/owner-platform-v1/rollout/${name}`, import.meta.url)),
  "utf8",
);
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

describe("rollout/apply-0022.sql", () => {
  const ordinal = 22;
  const name = "0022_studio_conversation_members.sql";
  const statement = read("apply-0022.sql");
  const tag = "$m0022$";

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

  it("checks the member table, policy, grants and foreign-key deletion rules after applying", () => {
    expect(statement).toContain("'public.studio_conversation_members'::regclass");
    expect(statement).toContain("studio_conversation_members_workspace_id_fkey|FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE");
    expect(statement).toContain("studio_conversation_members_conversation_id_fkey|FOREIGN KEY (conversation_id) REFERENCES studio_conversations(id) ON DELETE CASCADE");
    expect(statement).toContain("studio_conversation_members_user_id_fkey|FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE");
    expect(statement).toContain("studio_conversation_members_added_by_fkey|FOREIGN KEY (added_by) REFERENCES app_users(id) ON DELETE SET NULL");
    expect(statement).toContain("studio_conversation_members_role_check");
    expect(statement).toContain("FROM pg_policies WHERE schemaname='public'");
    expect(statement).toContain("has_table_privilege('sme_app_runtime'");
  });
});
