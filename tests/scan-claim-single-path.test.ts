import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// P3.5a: every production scan claim goes through lib/budgets/scan.ts
// (BUDGETED_CLAIM_SQL), which meters it and writes its scan_attempts row in
// the same statement. The older claim_audit_job SQL function (migration 0004,
// immutable) and its wrapper workflowRepository().claimAuditJob still exist,
// because an integration test exercises the function, but they claim without
// writing an attempt row. This guard keeps any production source from
// calling either, so nothing claims a scan outside the metered path.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = ["lib", "app", "scripts"];
const DEFINITION_FILE = "lib/repositories/workflow.ts";
const SOURCE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;
const TEST = /\.test\.[cm]?[jt]sx?$/;
// Any use of the wrapper: a call, a property read, a destructuring.
const METHOD_REFERENCE = /\bclaimAuditJob\b/g;
// The wrapper's own definition, which is allowed once in DEFINITION_FILE.
const METHOD_DEFINITION = /\basync\s+claimAuditJob\s*\(/g;
// An invocation of the SQL function, schema-qualified or quoted or not. A bare
// mention (a comment, the catalog's name list) is not an invocation.
const SQL_CALL = /(?:"?public"?\s*\.\s*)?"?\bclaim_audit_job"?\s*\(/gi;

const count = (pattern: RegExp, text: string) => text.match(pattern)?.length ?? 0;

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "__snapshots__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(full)));
    else if (SOURCE.test(entry.name) && !TEST.test(entry.name)) files.push(full);
  }
  return files;
}

/** Production files that reach the unmetered claim, beyond the wrapper's own definition. */
async function unmeteredClaimers(root = repoRoot): Promise<string[]> {
  const offenders: string[] = [];
  for (const dir of ROOTS) {
    for (const file of await sourceFiles(path.join(root, dir))) {
      const relative = path.relative(root, file).split(path.sep).join("/");
      const text = await readFile(file, "utf8");
      const own = relative === DEFINITION_FILE;
      const methodUses = count(METHOD_REFERENCE, text) - (own ? Math.min(1, count(METHOD_DEFINITION, text)) : 0);
      const sqlCalls = count(SQL_CALL, text) - (own ? 1 : 0);
      if (methodUses > 0 || sqlCalls > 0) offenders.push(relative);
    }
  }
  return offenders.sort();
}

describe("scan claims take the metered path only", () => {
  it("no production source calls claimAuditJob or claim_audit_job outside the wrapper's definition", async () => {
    expect(await unmeteredClaimers()).toEqual([]);
  });

  it("finds the wrapper exactly where the allowance assumes it is", async () => {
    const text = await readFile(path.join(repoRoot, DEFINITION_FILE), "utf8");
    expect(count(METHOD_DEFINITION, text)).toBe(1);
    expect(count(METHOD_REFERENCE, text)).toBe(1);
    expect(count(SQL_CALL, text)).toBe(1);
  });

  it("matches a call, a property read and the SQL invocation in any spelling", () => {
    for (const source of ["await repo.claimAuditJob(id)", "const { claimAuditJob } = workflowRepository(client)", "run(repo.claimAuditJob)"]) {
      expect(count(METHOD_REFERENCE, source)).toBe(1);
    }
    for (const sql of ["SELECT * FROM public.claim_audit_job($1)", "select * from claim_audit_job ($1)", 'SELECT * FROM "public"."claim_audit_job"($1)']) {
      expect(count(SQL_CALL, sql)).toBe(1);
    }
  });

  it("does not flag a mention that is not an invocation", () => {
    for (const text of ["// matching claim_audit_job's 30-minute lease", '["approve_output_version","claim_audit_job","claim_workspace_completion"]', "SELECT public.claim_audit_jobs_v2($1)"]) {
      expect(count(SQL_CALL, text)).toBe(0);
    }
    expect(count(METHOD_REFERENCE, "claimAuditJobs(id)")).toBe(0);
  });
});
