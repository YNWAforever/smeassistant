import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadMigrations } from "../scripts/neon/migrations";

// The reconcile statement writes journal rows by hand. A wrong name or checksum would
// make the repository runner refuse the hosted journal (migration_checksum_mismatch).
const statement = readFileSync(
  fileURLToPath(new URL("../docs/implementation/owner-platform-v1/rollout/reconcile-journal-0009-0015.sql", import.meta.url)),
  "utf8",
);
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

describe("rollout/reconcile-journal-0009-0015.sql", () => {
  it("requires exactly journal 0001-0008 with the on-disk checksums", async () => {
    const migrations = (await loadMigrations()).slice(0, 8);
    const block = statement.split("expected_journal CONSTANT text[] := ARRAY[")[1]?.split("];")[0] ?? "";
    const listed = [...block.matchAll(/'(\d+ \S+ [a-f0-9]{64})'/g)].map((match) => match[1]);
    expect(listed).toEqual(migrations.map((m, i) => `${i + 1} ${m.name} ${sha256(m.sql)}`));
  });

  it("records rows 9-15 with the names and checksums the runner would write", async () => {
    const migrations = (await loadMigrations()).slice(8, 15);
    expect(migrations.map((m) => m.name)).toEqual([
      "0009_scan_attempts.sql", "0010_mail_outbox.sql", "0011_offers.sql", "0012_work_packs.sql",
      "0013_preview_events.sql", "0014_publish_reply.sql", "0015_action_list_indexes.sql",
    ]);
    const insert = statement.split("INSERT INTO neon_migrations.journal(ordinal, name, checksum) VALUES")[1]?.split(";")[0] ?? "";
    const rows = [...insert.matchAll(/\((\d+), '([^']+)', '([a-f0-9]{64})'\)/g)].map((match) => `${match[1]} ${match[2]} ${match[3]}`);
    expect(rows).toEqual(migrations.map((m, i) => `${i + 9} ${m.name} ${sha256(m.sql)}`));
  });

  it("checks every schema category before writing and changes nothing else", () => {
    for (const category of ["columns", "constraints", "functions", "indexes", "runtime_grants", "tables", "triggers", "types"]) {
      expect(statement).toMatch(new RegExp(`ARRAY\\['${category}', '[a-f0-9]{32}'\\]`));
    }
    const body = statement.split("DO $reconcile$")[1] ?? "";
    expect(body).not.toMatch(/\b(ALTER|DROP|CREATE|GRANT|REVOKE|UPDATE|DELETE|TRUNCATE)\b/);
    expect(body.match(/\bINSERT INTO\b/g)).toHaveLength(1);
  });
});
