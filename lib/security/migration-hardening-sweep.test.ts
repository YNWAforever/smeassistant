import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Discovers every table the migration set creates and asserts each one is closed
 * to public/anon/authenticated and opened only to service_role.
 *
 * This exists because the two older contract tests (trust-migration-contract and
 * evidence-migration-contract) each read a hardcoded list of migration FILES and
 * assert against a hardcoded list of TABLE names. A new migration adding a new
 * table — and v0.2 plans several — is caught by neither. Migrations here are
 * applied by hand through the Supabase dashboard with no CLI step and no
 * ALTER DEFAULT PRIVILEGES, so a forgotten revoke/grant block ships silently and
 * exposes a table to the anon key.
 *
 * The assertions run against the whole corpus rather than per file on purpose:
 * 0001 creates four tables and hardens none of them; that hardening arrives in
 * 20260714 and 20260717. What matters is that every table is hardened somewhere,
 * not where.
 */

const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

const files = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const corpus = files.map((name) => readFileSync(join(MIGRATIONS_DIR, name), "utf8")).join("\n");

/** Matches `create table x`, `create table public.x`, `create table if not exists public.x`. */
function discoverTables(sql: string): string[] {
  const pattern = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi;
  return [...new Set([...sql.matchAll(pattern)].map((match) => match[1]!.toLowerCase()))].sort();
}

const tables = discoverTables(corpus);

/**
 * Statements, not the whole corpus.
 *
 * The assertions below used to run `[\s\S]*?` across the concatenated corpus,
 * which let a match be stitched out of three unrelated migrations: a `revoke all
 * on table` prefix from one file, the table name from a second, and the
 * `from public, anon, authenticated` suffix from a third. Every table matched
 * the same 20260717 block rather than its own, so a table with no hardening at
 * all still passed — the exact failure this file exists to catch.
 *
 * Splitting on `;` is crude but sound here: these are DDL/DCL migrations with no
 * function bodies containing semicolons outside `$$ ... $$`, and the security
 * definer bodies are checked separately below.
 *
 * Comments are stripped BEFORE dollar-quoted bodies, and the order is load-bearing.
 * 20260729000000_scan_claim_lease.sql line 17 is a comment containing the text
 * `as $$`, which gave that file an ODD number of `$$` markers. Stripping bodies
 * first paired that comment marker with the real opener, leaving the real closer
 * to pair with the next `$$` ANYWHERE IN THE CORPUS — swallowing every migration
 * in between. Nothing failed while the odd marker was the last one, so the bug sat
 * dormant until a later migration added a dollar-quoted block; then the
 * workspaces and oauth_connections revoke/grant statements silently vanished from
 * `allStatements` and their hardening assertions failed. Had the swallowed span
 * covered a table with no hardening instead, this file would have gone quiet
 * about exactly the thing it exists to catch.
 */
function statements(sql: string): string[] {
  return sql
    .replace(/--[^\n]*/g, " ") // line comments first: one contains a bare `as $$`
    .replace(/\$\$[\s\S]*?\$\$/g, " ") // then function bodies
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean);
}

const allStatements = statements(corpus);

/** A statement naming this table as its own word, not as a substring. */
function mentions(statement: string, table: string): boolean {
  return new RegExp(`\\b${table}\\b`).test(statement);
}

describe("migration hardening sweep", () => {
  it("finds migration files to scan", () => {
    // Guards the discovery itself: a bad path would otherwise make every
    // assertion below vacuously pass over an empty corpus.
    expect(files.length).toBeGreaterThan(0);
    expect(corpus.length).toBeGreaterThan(0);
  });

  it("leaves no file with an unbalanced dollar-quote marker", () => {
    // The tripwire for the ordering bug documented on `statements()`. An odd
    // number of `$$` in one file makes body-stripping pair markers ACROSS files,
    // silently deleting whole migrations from `allStatements`. That failure is
    // invisible: the assertions below just stop seeing the statements they were
    // meant to check, and pass for tables that were never hardened.
    const unbalanced = files.filter((name) => {
      const withoutComments = readFileSync(join(MIGRATIONS_DIR, name), "utf8").replace(/--[^\n]*/g, " ");
      return (withoutComments.match(/\$\$/g) ?? []).length % 2 !== 0;
    });
    expect(unbalanced, "an odd $$ count makes body-stripping cross file boundaries").toEqual([]);
  });

  it("discovers every table currently in the schema", () => {
    // Not a hardcoded allowlist to maintain — a tripwire. If this fails because a
    // table was legitimately added, add it here AND confirm the hardening
    // assertions below still pass for it.
    expect(tables).toEqual([
      // Added 2026-09-03 with 20260903000000_workspace_layer.sql (the whole
      // Visibility Workspace layer, CLAUDE.md 3.3), each in alphabetical
      // position below. The tripwire fired first, and the RLS/revoke/grant
      // assertions below passed for every one before these lines existed.
      "action_measurements",
      "action_runs",
      "actions",
      // Added 2026-08-24 with 20260824000000_aeo_surface_snapshots.sql. The
      // tripwire fired first, and the RLS/revoke/grant assertions below
      // passed for it before this line existed.
      "aeo_surface_snapshots",
      // Added 2026-08-18 with 20260818000000_agent_runs.sql. The tripwire fired
      // first, and the RLS/revoke/grant assertions below passed for it before
      // this line existed.
      "agent_runs",
      // Added 2026-09-03 with 20260903000000_workspace_layer.sql.
      "assets",
      // Added 2026-09-03 with 20260903000000_workspace_layer.sql.
      "audit_events",
      "audit_findings",
      "audit_jobs",
      // Added 2026-09-03 with 20260903000000_workspace_layer.sql.
      "brand_profiles",
      "consent_records",
      // Added 2026-09-03 with 20260903000000_workspace_layer.sql.
      "deliveries",
      // Added 2026-08-06 with 20260806000000_data_lifecycle.sql. Same order as
      // below: the tripwire fired, the RLS/revoke/grant assertions passed for it,
      // and only then was this line added.
      "erasure_events",
      "leads",
      // Added 2026-09-03 with 20260903000000_workspace_layer.sql.
      "locations",
      // Added 2026-08-20 with 20260820000000_notification_layer.sql. The
      // tripwire fired first, and the RLS/revoke/grant assertions below
      // passed for it before this line existed.
      "notification_events",
      // Added 2026-08-01 with 20260801000000_workspaces_oauth_connections.sql.
      // The tripwire fired on both, and the RLS/revoke/grant assertions below
      // passed for them before this list was touched — which is the order the
      // comment above asks for.
      "oauth_connections",
      // Added 2026-09-03 with 20260903000000_workspace_layer.sql.
      "output_versions",
      "rate_limit_buckets",
      "report_access_grants",
      "report_evidence",
      // Added 2026-08-17 with 20260817000000_scan_diffs.sql, in the order the
      // comment above asks for: the tripwire fired first, and the
      // RLS/revoke/grant assertions below passed for it before this line existed.
      "scan_diffs",
      "scan_events",
      // Added 2026-08-16 with 20260816000000_scan_schedules.sql, in the order
      // the comment above asks for: the tripwire fired first, and the
      // RLS/revoke/grant assertions below passed for it before this line existed.
      "scan_schedules",
      // Added 2026-09-03 with 20260903000000_workspace_layer.sql.
      "scan_snapshots",
      "staff_report_events",
      // Added 2026-08-15 with 20260815000000_workspace_access_requests.sql, in
      // the order the comment above asks for: the tripwire fired first, and the
      // RLS/revoke/grant assertions below passed for it before this line existed.
      "workspace_access_requests",
      // Added 2026-08-22 with 20260822090000_workspace_claim_events.sql. The
      // tripwire fired first, and the RLS/revoke/grant assertions below
      // passed for it before this line existed.
      "workspace_claim_events",
      // Added 2026-08-22 with 20260822000000_workspace_members.sql. The
      // tripwire fired first, and the RLS/revoke/grant assertions below
      // passed for it before this line existed.
      "workspace_members",
      // Added 2026-09-03 with 20260903000000_workspace_layer.sql.
      "workspace_notifications",
      "workspace_scan_completions",
      // Added 2026-08-19 with 20260819000000_workspace_billing.sql. The
      // tripwire fired first, and the RLS/revoke/grant assertions below
      // passed for it before this line existed.
      "workspace_tier_events",
      // Added 2026-09-03 with 20260903000000_workspace_layer.sql.
      "workspace_usage",
      "workspaces",
    ]);
  });

  it.each(tables)("enables row level security on %s", (table) => {
    expect(corpus).toMatch(new RegExp(`alter table (?:public\\.)?${table} enable row level security`, "i"));
  });

  it.each(tables)("revokes all privileges on %s from public, anon and authenticated", (table) => {
    // One statement must do all three things: be a revoke, name this table, and
    // strip all three roles. Previously these could come from three files.
    const revoked = allStatements.some(
      (statement) =>
        statement.startsWith("revoke all on") &&
        mentions(statement, table) &&
        /\bpublic\b/.test(statement) &&
        /\banon\b/.test(statement) &&
        /\bauthenticated\b/.test(statement),
    );
    expect(revoked, `no single statement revokes public/anon/authenticated on ${table}`).toBe(true);
  });

  it.each(tables)("grants %s DML to service_role only", (table) => {
    const granted = allStatements.some(
      (statement) =>
        statement.startsWith("grant select, insert, update, delete on") &&
        mentions(statement, table) &&
        /\bto service_role\b/.test(statement),
    );
    expect(granted, `no single statement grants DML on ${table} to service_role`).toBe(true);
  });

  it("pins an empty search path on every security-definer function", () => {
    const definers = [...corpus.matchAll(/create or replace function[\s\S]*?security definer[\s\S]*?as \$\$/gi)];
    expect(definers.length).toBeGreaterThan(0);
    for (const definer of definers) {
      expect(definer[0]).toMatch(/set search_path = ''/i);
      expect(definer[0]).not.toMatch(/set search_path = public/i);
    }
  });

  it("never grants a table privilege to anon or authenticated", () => {
    // The deny-all posture is what makes application-layer tenant authorization
    // safe (see docs/v0.2-plan.md section 17-B). Reopening it must be a deliberate,
    // reviewed change that updates this test — not something a migration slips in.
    // `TABLE` is optional in Postgres GRANT, and schema-wide grants read
    // `on all tables in schema` — requiring the literal "on table" meant
    // `grant select on public.leads to anon` and
    // `grant all on all tables in schema public to anon` were never inspected.
    const grants = allStatements.filter((statement) => statement.startsWith("grant "));
    expect(grants.length).toBeGreaterThan(0);
    for (const grant of grants) {
      const roles = grant.split(/\bto\b/).slice(1).join(" ");
      expect(roles, `grant reopens access: ${grant}`).not.toMatch(/\banon\b|\bauthenticated\b/);
    }
  });
});

/**
 * Every foreign key referencing audit_jobs must END UP with an explicit on-delete
 * action. Without one, `delete from audit_jobs` raises a foreign-key violation —
 * which is how the privacy policy's takedown paragraph came to describe an
 * operation the database refuses.
 *
 * Final state, not text presence. Migrations are append-only history:
 * 0001_v0_1_schema.sql will say `references audit_jobs(id)` with no action
 * forever, whatever a later migration does to that constraint. So the corpus is
 * walked in filename order — the order an operator applies it — and the last
 * statement touching a given table.column wins. This mirrors the reasoning in
 * this file's header for grants: what matters is that every reference is
 * declared somewhere, not where.
 *
 * audit_jobs.parent_job_id is the one a hardcoded list would have missed, and did:
 * docs/v0.2-plan.md section 4.3 item 8 names only leads and scan_events. It is a
 * self-reference added later by ALTER, so a job that was ever re-scanned blocked
 * deleting its own parent — the merchants who scanned twice, and the ones most
 * likely to ask for erasure.
 */
const AUDIT_JOBS_REF = String.raw`references\s+(?:public\.)?audit_jobs\s*\(\s*id\s*\)`;

function onDeleteAction(tail: string): string | null {
  return tail.match(/on\s+delete\s+(cascade|set\s+null|restrict)/i)?.[1]?.toLowerCase() ?? null;
}

/** Map of `table.column` → the on-delete action left in force by the last migration to set it. */
function finalAuditJobsFkState(): Map<string, string | null> {
  const state = new Map<string, string | null>();

  for (const name of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, name), "utf8");

    // Inline column definitions inside `create table ... ( ... );`
    for (const block of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\s*\);/gi)) {
      const table = block[1]!.toLowerCase();
      const columns = block[2]!.matchAll(
        new RegExp(String.raw`^\s*(\w+)\s+[^,\n]*?${AUDIT_JOBS_REF}([^,\n]*)`, "gim"),
      );
      for (const column of columns) {
        state.set(`${table}.${column[1]!.toLowerCase()}`, onDeleteAction(column[2] ?? ""));
      }
    }

    // `alter table ... add column ... references` and `... add constraint ... foreign key`
    for (const statement of sql.matchAll(/alter\s+table\s+(?:public\.)?(\w+)([\s\S]*?);/gi)) {
      const table = statement[1]!.toLowerCase();
      const body = statement[2]!;
      const added = body.matchAll(
        new RegExp(String.raw`add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)[^,;]*?${AUDIT_JOBS_REF}([^,;\n]*)`, "gi"),
      );
      for (const column of added) {
        state.set(`${table}.${column[1]!.toLowerCase()}`, onDeleteAction(column[2] ?? ""));
      }
      const constrained = body.matchAll(
        new RegExp(String.raw`add\s+constraint\s+\w+\s+foreign\s+key\s*\(\s*(\w+)\s*\)\s*${AUDIT_JOBS_REF}([^,;]*)`, "gi"),
      );
      for (const column of constrained) {
        state.set(`${table}.${column[1]!.toLowerCase()}`, onDeleteAction(column[2] ?? ""));
      }
    }
  }

  return state;
}

describe("audit_jobs delete graph", () => {
  it("still sees the references it is meant to be watching", () => {
    // Guards the parser above. A regex that silently matches nothing would make
    // the assertion below vacuously green — the failure mode of every contract
    // test written against text rather than a live schema.
    // audit_jobs.workspace_id is deliberately absent: it references workspaces,
    // not audit_jobs, so it is outside this contract. It has its own test below.
    expect([...finalAuditJobsFkState().keys()].sort()).toEqual([
      "aeo_surface_snapshots.job_id",
      "agent_runs.job_id",
      "audit_findings.job_id",
      "audit_jobs.parent_job_id",
      "consent_records.job_id",
      "leads.job_id",
      "notification_events.job_id",
      "report_access_grants.job_id",
      "report_evidence.job_id",
      "scan_diffs.base_job_id",
      "scan_diffs.head_job_id",
      "scan_events.job_id",
      "scan_schedules.last_job_id",
      // Added 2026-09-03 with 20260903000000_workspace_layer.sql.
      "scan_snapshots.job_id",
      "staff_report_events.job_id",
      "workspace_access_requests.job_id",
      "workspace_claim_events.job_id",
      "workspace_scan_completions.job_id",
    ]);
  });

  it("leaves every audit_jobs reference with an explicit on-delete action", () => {
    const undeclared = [...finalAuditJobsFkState()]
      .filter(([, action]) => action === null)
      .map(([reference]) => reference)
      .sort();
    expect(undeclared, "an undeclared reference makes the job undeletable").toEqual([]);
  });

  it("pins the exact action on every reference, not merely that one exists", () => {
    // "Not null" is too weak a contract: flipping any of these from cascade to
    // set null, or the reverse, changes what an erasure destroys while leaving
    // the assertion above green. staff_report_events in particular MUST stay
    // `set null` -- cascade would let a staff member erase the record of their
    // own disclosure by erasing the job. Changing a value here should be a
    // deliberate edit with a reason, which is the point.
    expect(Object.fromEntries([...finalAuditJobsFkState()].sort())).toEqual({
      // cascade: erasing a job must not leave AI-visibility history (query
      // text, competitor names, excerpts) orphaned behind it.
      "aeo_surface_snapshots.job_id": "cascade",
      "agent_runs.job_id": "cascade",
      "audit_findings.job_id": "cascade",
      "audit_jobs.parent_job_id": "cascade",
      "consent_records.job_id": "cascade",
      "leads.job_id": "cascade",
      // set null, not cascade: same reasoning as staff_report_events below --
      // erasing the report should not erase the record that a notification
      // was sent about it.
      "notification_events.job_id": "set null",
      "report_access_grants.job_id": "cascade",
      "report_evidence.job_id": "cascade",
      // cascade on both sides: a diff restates content from both scans, so
      // erasing either one leaves nothing left to compare.
      "scan_diffs.base_job_id": "cascade",
      "scan_diffs.head_job_id": "cascade",
      "scan_events.job_id": "cascade",
      // set null, deliberately not cascade: this column points at the LAST job a
      // monthly schedule produced, not at data belonging to that job. Cascade
      // would let a single takedown request end the merchant's whole recurring
      // relationship -- erase one report and the schedule that would have
      // produced next month's disappears with it, silently.
      "scan_schedules.last_job_id": "set null",
      // cascade: a workspace snapshot is derived from one job's module_results
      // (CLAUDE.md 3.3, "never a second score"); erasing the job leaves nothing
      // for the snapshot to describe, and a dangling snapshot would keep the
      // merchant's coverage/metrics alive after the takedown.
      "scan_snapshots.job_id": "cascade",
      "staff_report_events.job_id": "set null",
      // cascade, unlike staff_report_events: a request is merchant-supplied data
      // about one report, not proof that Fimmick handled something. Erasing the
      // report should take it. The audit of a staff member RESOLVING a request
      // lives in staff_report_events and survives, as that row always has.
      "workspace_access_requests.job_id": "cascade",
      // set null, not cascade: this table exists to answer "how did this
      // workspace get claimed" after the fact, and audit_jobs.workspace_id is
      // already `set null` for the same reason -- the scan is not the account's
      // to destroy. Cascade here would erase the claim's own provenance at
      // exactly the moment (a takedown) someone would go looking for it, leaving
      // a live, owned workspace with no record of how it came to be owned.
      "workspace_claim_events.job_id": "set null",
      // Recovery state describes this job only; erasure must remove it.
      "workspace_scan_completions.job_id": "cascade",
    });
  });

  it("keeps the staff audit trail when the job it audits is erased", () => {
    // set null, not cascade: a staff member who discloses a contact must not be
    // able to erase the record by erasing the job.
    expect(finalAuditJobsFkState().get("staff_report_events.job_id")).toBe("set null");
  });

  it("constrains audit_jobs.workspace_id, which 0001 left as a bare uuid", () => {
    // 0001 put a nullable workspace_id on every table "so v0.2 can backfill" and
    // never constrained it when workspaces arrived in 20260801000000. Since
    // workspaces.owner_user_id cascades from auth.users, deleting an auth user
    // destroyed the workspace and left this column pointing at nothing.
    //
    // set null, not cascade: the scan is not the account's to destroy, and an
    // unowned scan is a state the system already models.
    const constraint = corpus.match(
      /add\s+constraint\s+\w+\s+foreign\s+key\s*\(\s*workspace_id\s*\)\s*references\s+(?:public\.)?workspaces\s*\(\s*id\s*\)([^,;]*)/i,
    );
    expect(constraint, "audit_jobs.workspace_id has no foreign key at all").not.toBeNull();
    expect(onDeleteAction(constraint?.[1] ?? "")).toBe("set null");
  });

  it("declares workspace_claim_events.workspace_id set null, not cascade -- a cascade there would contradict the table's own stated reason for leaving claimed_by_user_id with no FK at all", () => {
    // The cross-cutting review's finding: the migration's comment justifies
    // omitting a FK on claimed_by_user_id by saying the row should survive even
    // if "the workspace itself" disappears, but workspace_id originally
    // cascaded -- and workspace_members' delete_orphaned_workspace trigger
    // (asserted by verify-migrations.sh) really does delete a workspace outright
    // once its last member leaves, not only through staff erasure. A cascading
    // workspace_id would let an ordinary membership departure destroy this row,
    // contradicting the stated invariant.
    const inlineColumn = corpus.match(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?workspace_claim_events\s*\(([\s\S]*?)\n\s*\);/i,
    );
    expect(inlineColumn, "workspace_claim_events' create table statement was not found").not.toBeNull();
    const columnMatch = inlineColumn?.[1]?.match(
      /^\s*workspace_id\s+uuid\s+references\s+(?:public\.)?workspaces\s*\(\s*id\s*\)([^,\n]*)/im,
    );
    expect(columnMatch, "workspace_claim_events.workspace_id has no foreign key at all").not.toBeNull();
    expect(onDeleteAction(columnMatch?.[1] ?? "")).toBe("set null");
  });

  it("carries an erased_workspace_id column on workspace_claim_events, mirroring erased_job_id's provenance-retention pattern", () => {
    const inlineColumn = corpus.match(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?workspace_claim_events\s*\(([\s\S]*?)\n\s*\);/i,
    );
    expect(inlineColumn?.[1]).toMatch(/erased_workspace_id\s+text/i);
  });
});
