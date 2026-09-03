import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260714_trust_foundation.sql", import.meta.url),
  "utf8",
);
const hardeningMigration = readFileSync(
  new URL("../../supabase/migrations/20260717022612_harden_server_only_grants.sql", import.meta.url),
  "utf8",
);

const sensitiveTables = [
  "audit_jobs",
  "audit_findings",
  "leads",
  "report_access_grants",
  "consent_records",
  "staff_report_events",
  "scan_events",
  "rate_limit_buckets",
];

const claimJobSignature = "public.claim_audit_job(uuid)";
const unlockSignature =
  "public.complete_report_unlock(uuid,text,text,text,text,text,text,boolean,boolean,boolean,text,text,text,text,text,timestamptz,text,jsonb)";

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").replace(/\s*([(),])\s*/g, "$1").trim().toLowerCase();
}

describe("trust foundation migration security contract", () => {
  it("enables RLS and explicitly grants only the service role on every sensitive table", () => {
    for (const sql of [migration, hardeningMigration]) {
      for (const table of sensitiveTables) {
        expect(sql).toMatch(new RegExp(`alter table (?:public\\.)?${table} enable row level security`, "i"));
        expect(sql).toMatch(new RegExp(`revoke all on table[\\s\\S]*?\\b${table}\\b[\\s\\S]*?from public, anon, authenticated`, "i"));
        expect(sql).toMatch(new RegExp(`grant select, insert, update, delete on table[\\s\\S]*?\\b${table}\\b[\\s\\S]*?to service_role`, "i"));
      }
    }
  });

  it("uses an empty search path for every security-definer RPC", () => {
    const definerFunctions = [...migration.matchAll(/create or replace function[\s\S]*?security definer[\s\S]*?as \$\$/gi)];
    expect(definerFunctions).toHaveLength(2);
    for (const definition of definerFunctions) {
      expect(definition[0]).toMatch(/set search_path = ''/i);
      expect(definition[0]).not.toMatch(/set search_path = public/i);
    }
  });

  it("reasserts empty RPC search paths for already-migrated environments", () => {
    expect(hardeningMigration).toMatch(/alter function public\.claim_audit_job\(uuid\) set search_path = ''/i);
    expect(hardeningMigration).toMatch(/alter function public\.complete_report_unlock\([\s\S]*?\) set search_path = ''/i);
  });

  it("keeps both security-definer RPCs executable only by the service role", () => {
    for (const sql of [migration, hardeningMigration].map(normalizeSql)) {
      for (const signature of [claimJobSignature, unlockSignature]) {
        expect(sql).toContain(normalizeSql(`revoke execute on function ${signature} from public, anon, authenticated`));
        expect(sql).toContain(normalizeSql(`grant execute on function ${signature} to service_role`));
      }
    }
  });

  it("schema-qualifies extension functions used with an empty search path", () => {
    for (const sql of [migration, hardeningMigration]) {
      expect(sql).toMatch(/encode\s*\(\s*extensions\.digest\s*\(/i);
      expect(sql).not.toMatch(/encode\s*\(\s*digest\s*\(/i);
    }
  });
});
