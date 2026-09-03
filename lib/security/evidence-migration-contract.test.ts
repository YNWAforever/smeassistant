import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20260721174713_private_report_evidence.sql",
    import.meta.url,
  ),
  "utf8",
);

function normalizeSql(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function assertServerOnlyEvidenceMigration(value: string) {
  const normalizedSql = normalizeSql(value);

  expect(normalizedSql).toMatch(
    /create table if not exists public\.report_evidence/i,
  );
  expect(normalizedSql).toMatch(
    /references public\.audit_jobs\(id\) on delete cascade/i,
  );
  expect(normalizedSql).toMatch(
    /alter table public\.report_evidence enable row level security/i,
  );
  expect(normalizedSql).toMatch(
    /revoke all on table public\.report_evidence from public, anon, authenticated/i,
  );
  expect(normalizedSql).toMatch(
    /grant select, insert, update, delete on table public\.report_evidence to service_role/i,
  );
  expect(normalizedSql).not.toMatch(/create policy\b/i);

  expect(normalizedSql).toMatch(
    /values \('report-evidence', 'report-evidence', false, 5242880, array\['image\/jpeg', 'image\/png', 'image\/webp'\]\)/i,
  );
  expect(normalizedSql).toMatch(
    /on conflict \(id\) do update set name = excluded\.name, public = false, file_size_limit = excluded\.file_size_limit, allowed_mime_types = excluded\.allowed_mime_types/i,
  );
}

describe("private report evidence migration", () => {
  it("keeps evidence metadata server-only and the bucket private", () => {
    assertServerOnlyEvidenceMigration(sql);
  });

  it("rejects an injected policy regardless of its target role", () => {
    expect(() =>
      assertServerOnlyEvidenceMigration(
        `${sql}\ncreate policy leaked on public.report_evidence using (true);`,
      ),
    ).toThrow();
  });

  it("rejects a weakened bucket conflict update", () => {
    expect(() =>
      assertServerOnlyEvidenceMigration(
        sql.replace("public = false", "public = excluded.public"),
      ),
    ).toThrow();
  });
});
