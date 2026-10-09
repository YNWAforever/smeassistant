import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildMissingColumnsSql, MISSING_COLUMNS_SQL_PATH } from "../scripts/neon/missing-columns-sql";

const committed = readFileSync(fileURLToPath(new URL(`../${MISSING_COLUMNS_SQL_PATH}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");

describe("docs/operations/check-missing-columns.sql", () => {
  it("matches the application schema (run `corepack pnpm db:missing-columns-sql` after a schema change)", () => {
    expect(committed).toBe(buildMissingColumnsSql());
  });

  it("covers the columns whose absence broke the production owner home (F-16)", () => {
    expect(committed).toContain("('actions','offer_id')");
    expect(committed).toContain("('output_versions','first_published_at')");
    expect(committed).toContain("('mail_outbox','lease_token')");
  });

  it("is read-only", () => {
    const statements = committed.split("\n").filter((line) => !line.startsWith("--")).join("\n");
    expect(statements).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|GRANT|REVOKE|TRUNCATE)\b/i);
    expect(statements.trim().startsWith("SELECT")).toBe(true);
  });
});
