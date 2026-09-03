import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STALE_AFTER_MS } from "@/lib/scheduler/constants";

/**
 * Static contract for the claim lease migration.
 *
 * Migrations here are applied by hand through the Supabase dashboard, and no test
 * in this repo opens a database connection — so nothing can prove the deployed
 * function matches this file. What these assertions do protect is the properties
 * that are silent when wrong: an unpinned search_path on a security-definer
 * function, a terminal status becoming reclaimable, or an unbounded retry loop.
 *
 * TRAP THIS FILE ONCE FELL INTO, for whoever touches claim_audit_job next: this
 * used to hardcode the filename of the migration that first defined the function
 * (20260729000000_scan_claim_lease.sql). When 20260821000001_widen_claim_lease.sql
 * superseded it with `create or replace`, this file kept reading the ORIGINAL
 * file — which still says `interval '15 minutes'` verbatim forever, because
 * migrations are append-only history and nobody edits an old one after the fact.
 * Every assertion below stayed green while the function actually running in
 * production had moved to 30 minutes, and a genuine double-claim bug (the new
 * file's interval mutated to '1 minutes') passed the whole suite undetected.
 * Fixed by discovering the LATEST migration that redefines the function, by
 * filename sort, instead of a name pinned at the moment this file was written.
 * The next migration that touches claim_audit_job needs no edit here at all —
 * it just becomes the new latest.
 */

const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

function latestClaimAuditJobMigration(): string {
  const candidates = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) =>
      // The exact signature, not just the function name: a bare name match
      // would also hijack discovery on a future claim_audit_job_batch(...) or
      // a comment quoting this phrase. Matches the signature this file's own
      // "replaces the function rather than dropping it" assertion checks for,
      // so a genuine redefinition still passes both checks together.
      readFileSync(join(MIGRATIONS_DIR, name), "utf8").includes(
        "create or replace function public.claim_audit_job(p_job_id uuid)",
      ),
    );
  const latest = candidates.at(-1);
  if (!latest) throw new Error("no migration in supabase/migrations/ defines public.claim_audit_job");
  return latest;
}

const migration = readFileSync(join(MIGRATIONS_DIR, latestClaimAuditJobMigration()), "utf8");

/**
 * Comments are stripped before every assertion. These tests are about the SQL the
 * database will run, and prose explaining why we do NOT do something must not
 * read as doing it — the first draft of this file failed its own drop-function
 * assertion on a comment saying drops are unsafe.
 */
const sql = migration.replace(/--[^\n]*/g, "");
const normalized = sql.replace(/\s+/g, " ").toLowerCase();

describe("claim lease migration contract", () => {
  it("replaces the function rather than dropping it", () => {
    // DROP + CREATE resets EXECUTE to PUBLIC, and no test inspects grants in a
    // migration file it does not hardcode — so a dropped-and-recreated RPC could
    // silently become callable by anon. The signature is unchanged, so replace is
    // both sufficient and safer.
    expect(normalized).toContain("create or replace function public.claim_audit_job(p_job_id uuid)");
    expect(normalized).not.toContain("drop function");
  });

  it("keeps the signature and return type the processor depends on", () => {
    // asClaimedJob reads nine columns off the returned row; narrowing the return
    // shape would break the claim contract at processor.ts:316.
    expect(normalized).toContain("returns setof public.audit_jobs");
    expect(normalized).toContain("returning *");
  });

  it("pins an empty search path between security definer and the body", () => {
    expect(sql).toMatch(/security definer\s+set search_path = ''\s+as \$\$/i);
    expect(sql).not.toMatch(/set search_path = public/i);
  });

  it("still claims a queued job", () => {
    expect(normalized).toContain("status = 'queued'");
  });

  it("only ever reclaims a non-terminal job", () => {
    // Reclaiming done/partial/failed would re-run a finished scan, overwriting a
    // delivered report. The lease predicate must name the three live statuses
    // explicitly rather than negating the terminal ones.
    expect(normalized).toContain("status in ('collecting', 'scoring', 'persisting')");
    for (const terminal of ["'done'", "'partial'", "'failed'"]) {
      expect(normalized).not.toContain(`status in (${terminal}`);
    }
  });

  it("bounds retries so a poisoned job cannot loop forever", () => {
    expect(normalized).toContain("attempt_count < 3");
  });

  it("requires the lease to have actually expired, and treats a null attempt time as not expired", () => {
    expect(normalized).toContain("last_attempt_at is not null");
    expect(normalized).toMatch(/last_attempt_at < now\(\) - interval '30 minutes'/);
  });

  it("uses a lease window longer than the worst-case scan", () => {
    // The scan's own timeouts sum to roughly 600s on one SerpApi key. A window
    // shorter than that would reclaim a slow-but-alive scan underneath itself and
    // run two collectors against one job.
    const match = sql.match(/interval '(\d+) minutes'/);
    expect(match, "lease interval not found").not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(11);
  });

  it("keeps the SQL lease window and STALE_AFTER_MS in lockstep", () => {
    // The property this whole file exists for: the console/scheduler read
    // STALE_AFTER_MS, the database enforces the SQL literal above, and nothing
    // else ties them together. This is what actually catches the mismatch the
    // 20260729000000 -> 20260821000001 migration once slipped past silently.
    const match = sql.match(/interval '(\d+) minutes'/);
    expect(match, "lease interval not found").not.toBeNull();
    expect(Number(match![1]) * 60_000).toBe(STALE_AFTER_MS);
  });

  it("restates the service-role-only execute grant", () => {
    expect(normalized).toContain(
      "revoke execute on function public.claim_audit_job(uuid) from public, anon, authenticated",
    );
    expect(normalized).toContain("grant execute on function public.claim_audit_job(uuid) to service_role");
  });

  it("wraps the change in a transaction, matching the modern migrations", () => {
    expect(migration).toMatch(/^begin;/m);
    expect(migration).toMatch(/^commit;/m);
  });

  it("grants nothing to anon or authenticated", () => {
    for (const grant of migration.matchAll(/grant[^;]*?to ([^;]*);/gi)) {
      expect(grant[1]!.toLowerCase()).not.toMatch(/\banon\b|\bauthenticated\b/);
    }
  });
});
