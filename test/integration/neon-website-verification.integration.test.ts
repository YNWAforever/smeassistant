import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { verificationRepository } from "../../lib/repositories/verification";
import { applicationRepository } from "../../lib/repositories/applications";
import { measurementRepository } from "../../lib/repositories/measurements";
import { recordApplication } from "../../lib/workspace/applications";
import { recordMeasurements } from "../../lib/workspace/measurements";
import { rowToSnapshot, type ScanDiffRow, type ScanSnapshotRow, type SnapshotRecord } from "../../lib/workspace/snapshots";

// The template used throughout: it declares `verifyChecks: ["faq_schema"]`
// (lib/workspace/templates.ts) and maps to metric "aeo.ai_citation_count"
// (lib/workspace/measurements.ts TEMPLATE_METRIC), which the loop-closing
// cases need.
const TEMPLATE_KEY = "visibility-content";

describe.runIf(process.env.NEON_INTEGRATION === "1")("website verification eligibility and attribution", () => {
  let fixture: NeonDatabaseFixture, owner: Pool, runtime: Pool;

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query(
      "CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime",
    );
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href });
  });

  beforeEach(async () => {
    vi.stubGlobal("fetch", () => {
      throw new Error("transport forbidden");
    });
    await runtime.query(
      "DELETE FROM action_measurements; DELETE FROM action_applications; DELETE FROM output_versions; DELETE FROM actions; DELETE FROM scan_diffs; DELETE FROM scan_snapshots; DELETE FROM audit_jobs; DELETE FROM locations; DELETE FROM workspaces; DELETE FROM app_users",
    );
  });

  // Matches neon-action-applications.integration.test.ts. Harmless today
  // because the stub is idempotent and vitest isolates test files, but
  // without it a future case here that legitimately needs fetch would
  // silently inherit the forbidding stub with no visible cleanup contract.
  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    await Promise.all([owner?.end(), runtime?.end()]);
    fixture?.stop();
  });

  async function workspace(): Promise<string> {
    return (await runtime.query("INSERT INTO workspaces(slug,market) VALUES($1,'hk') RETURNING id", [`ws-${crypto.randomUUID()}`])).rows[0].id;
  }

  async function location(ws: string, websiteUrl: string | null = "https://example.test", id?: string): Promise<string> {
    return (
      await runtime.query("INSERT INTO locations(id,workspace_id,slug,name,website_url) VALUES(COALESCE($4,gen_random_uuid()),$1,$2,'Fixture',$3) RETURNING id", [
        ws,
        `loc-${crypto.randomUUID()}`,
        websiteUrl,
        id ?? null,
      ])
    ).rows[0].id;
  }

  async function job(ws: string, locationId: string | null, completedAt = "2026-08-01"): Promise<string> {
    return (
      await runtime.query(
        "INSERT INTO audit_jobs(business_name,workspace_id,region,status,location_id,created_at,completed_at) VALUES('Fixture',$1,'hk','done',$2,$3,$3) RETURNING id",
        [ws, locationId, completedAt],
      )
    ).rows[0].id;
  }

  /** A `scan_snapshots` row carrying `website_checks`, inserted directly rather than derived (Task 4's snapshot metric derivation is out of scope here). */
  async function snapshot(
    ws: string,
    jobId: string,
    locationId: string | null,
    opts: { metrics?: Record<string, number>; websiteChecks?: unknown; comparableTo?: string | null; diffId?: string | null; observedAt?: string } = {},
  ): Promise<string> {
    return (
      await runtime.query(
        `INSERT INTO scan_snapshots(job_id,workspace_id,location_id,market,observed_at,coverage,module_states,metrics,website_checks,comparable_to,diff_id)
         VALUES($1,$2,$3,'hk',$4,1,'{}'::jsonb,$5,$6,$7,$8) RETURNING id`,
        [
          jobId,
          ws,
          locationId,
          opts.observedAt ?? "2026-08-01",
          JSON.stringify(opts.metrics ?? {}),
          opts.websiteChecks ? JSON.stringify(opts.websiteChecks) : null,
          opts.comparableTo ?? null,
          opts.diffId ?? null,
        ],
      )
    ).rows[0].id;
  }

  /** An action eligible for verification: right template, a source snapshot, open. */
  async function action(
    ws: string,
    locationId: string | null,
    snapshotId: string | null,
    opts: { templateKey?: string; actionState?: string } = {},
  ): Promise<string> {
    return (
      await runtime.query(
        `INSERT INTO actions(workspace_id,location_id,template_key,source_snapshot_id,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,action_state)
         VALUES($1,$2,$3,$4,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'medium',20,'[]'::jsonb,5,'Live',$5,$6) RETURNING id`,
        [ws, locationId, opts.templateKey ?? TEMPLATE_KEY, snapshotId, `dedupe-${crypto.randomUUID()}`, opts.actionState ?? "ready"],
      )
    ).rows[0].id;
  }

  async function assertion(
    ws: string,
    actionId: string,
    source: "owner_asserted" | "verified",
    opts: { assertedAt?: string; assertedBy?: string | null; retractedAt?: string | null } = {},
  ): Promise<string> {
    return (
      await runtime.query(
        `INSERT INTO action_applications(workspace_id,action_id,source,asserted_by,asserted_at,retracted_at)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [ws, actionId, source, opts.assertedBy ?? null, opts.assertedAt ?? new Date().toISOString(), opts.retractedAt ?? null],
      )
    ).rows[0].id;
  }

  async function approvedVersion(ws: string, actionId: string, opts: { firstExportedAt?: string | null } = {}): Promise<string> {
    const versionNo = (await runtime.query("SELECT COALESCE(MAX(version_no), 0) + 1 AS next FROM output_versions WHERE action_id = $1", [actionId])).rows[0]
      .next;
    return (
      await runtime.query(
        `INSERT INTO output_versions(workspace_id,action_id,version_no,body,author_type,approval_state,first_exported_at)
         VALUES($1,$2,$3,'body','user','approved',$4) RETURNING id`,
        [ws, actionId, versionNo, opts.firstExportedAt ?? null],
      )
    ).rows[0].id;
  }

  /** Converts a raw `scan_snapshots` row (Date objects, driver-native jsonb) into the shape `rowToSnapshot` expects. */
  function toSnapshotRow(row: Record<string, unknown>): ScanSnapshotRow {
    return {
      id: row.id as string,
      job_id: row.job_id as string,
      workspace_id: row.workspace_id as string | null,
      location_id: row.location_id as string | null,
      market: row.market as string,
      observed_at: (row.observed_at as Date).toISOString?.() ?? (row.observed_at as string),
      scoring_version: row.scoring_version as string | null,
      overall_score: row.overall_score as number | string | null,
      coverage: row.coverage as number | string,
      module_states: row.module_states,
      metrics: row.metrics,
      website_checks: row.website_checks,
      comparable_to: row.comparable_to as string | null,
      diff_id: row.diff_id as string | null,
      created_at: (row.created_at as Date).toISOString?.() ?? (row.created_at as string),
    };
  }

  async function loadSnapshotRecord(id: string): Promise<SnapshotRecord> {
    const row = (await runtime.query("SELECT * FROM scan_snapshots WHERE id=$1", [id])).rows[0];
    return rowToSnapshot(toSnapshotRow(row));
  }

  async function loadDiffRecord(id: string): Promise<ScanDiffRow> {
    const row = (await runtime.query("SELECT * FROM scan_diffs WHERE id=$1", [id])).rows[0];
    return {
      id: row.id,
      base_job_id: row.base_job_id,
      head_job_id: row.head_job_id,
      comparable: row.comparable,
      incomparable_reason: row.incomparable_reason,
      composite_withheld_reason: row.composite_withheld_reason,
      intersection_modules: row.intersection_modules,
      composite_base: row.composite_base,
      composite_head: row.composite_head,
      composite_delta: row.composite_delta,
      resolved_findings: row.resolved_findings,
      regressed_findings: row.regressed_findings,
      decayed_findings: row.decayed_findings,
      lost_coverage: row.lost_coverage,
      gained_coverage: row.gained_coverage,
      created_at: row.created_at.toISOString?.() ?? row.created_at,
    };
  }

  /**
   * A comparable base/head snapshot pair for one location, with the head job
   * "starting" at 2026-09-01 -- the timestamp the attribution timing gate
   * measures assertions against. `aeo.ai_citation_count` moves 0 -> 2.
   */
  async function comparablePair(ws: string, loc: string): Promise<{ headSnapId: string; diffId: string }> {
    const baseJob = await job(ws, loc, "2026-08-01");
    const headJob = await job(ws, loc, "2026-09-01");
    const baseSnap = await snapshot(ws, baseJob, loc, { metrics: { "aeo.ai_citation_count": 0 }, observedAt: "2026-08-01" });
    const diffId = (
      await runtime.query("INSERT INTO scan_diffs(base_job_id,head_job_id,comparable) VALUES($1,$2,true) RETURNING id", [baseJob, headJob])
    ).rows[0].id;
    const headSnapId = await snapshot(ws, headJob, loc, {
      metrics: { "aeo.ai_citation_count": 2 },
      observedAt: "2026-09-01",
      comparableTo: baseSnap,
      diffId,
    });
    return { headSnapId, diffId };
  }

  // --- Engagement (owner_asserted / exported) and permanent exclusion (verified) ---

  it("returns an action with a live owner_asserted application", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const jobId = await job(ws, loc);
    const snap = await snapshot(ws, jobId, loc, { websiteChecks: { evaluated: 1, passed: 0, results: [{ key: "faq_schema", pass: false }] } });
    const act = await action(ws, loc, snap);
    await assertion(ws, act, "owner_asserted");

    const repo = verificationRepository(runtime);
    const due = await repo.dueLocations(10, [TEMPLATE_KEY]);
    expect(due.map((d) => d.location_id)).toEqual([loc]);
    const actions = await repo.actionsForLocations([loc], [TEMPLATE_KEY]);
    expect(actions.map((a) => a.id)).toEqual([act]);
    expect(actions[0].prior_checks).toMatchObject({ evaluated: 1, passed: 0 });
  });

  it("returns an action with an exported approved version but no assertion", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const jobId = await job(ws, loc);
    const snap = await snapshot(ws, jobId, loc);
    const act = await action(ws, loc, snap);
    await approvedVersion(ws, act, { firstExportedAt: new Date().toISOString() });

    const repo = verificationRepository(runtime);
    expect((await repo.dueLocations(10, [TEMPLATE_KEY])).map((d) => d.location_id)).toEqual([loc]);
    expect((await repo.actionsForLocations([loc], [TEMPLATE_KEY])).map((a) => a.id)).toEqual([act]);
  });

  it("does NOT return an action with neither an assertion nor an exported version", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const jobId = await job(ws, loc);
    const snap = await snapshot(ws, jobId, loc);
    await action(ws, loc, snap);
    // An approved-but-not-exported version does not count as engagement either.
    const act2 = await action(ws, loc, snap);
    await approvedVersion(ws, act2, { firstExportedAt: null });

    const repo = verificationRepository(runtime);
    expect(await repo.dueLocations(10, [TEMPLATE_KEY])).toEqual([]);
    expect(await repo.actionsForLocations([loc], [TEMPLATE_KEY])).toEqual([]);
  });

  it("does NOT return an action that already has a live verified row (permanent exclusion)", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const jobId = await job(ws, loc);
    const snap = await snapshot(ws, jobId, loc);
    const act = await action(ws, loc, snap);
    // Give it engagement AND a prior verified row: exclusion must win even
    // though the engagement condition alone would otherwise select it.
    await assertion(ws, act, "owner_asserted");
    await assertion(ws, act, "verified");

    const repo = verificationRepository(runtime);
    expect(await repo.dueLocations(10, [TEMPLATE_KEY])).toEqual([]);
    expect(await repo.actionsForLocations([loc], [TEMPLATE_KEY])).toEqual([]);
  });

  it("a retracted owner_asserted application does not count as engagement", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const jobId = await job(ws, loc);
    const snap = await snapshot(ws, jobId, loc);
    const act = await action(ws, loc, snap);
    // The ONLY application on this action is retracted, so there is no live
    // engagement signal left -- the location must not be due.
    await assertion(ws, act, "owner_asserted", { retractedAt: new Date().toISOString() });

    const repo = verificationRepository(runtime);
    expect(await repo.dueLocations(10, [TEMPLATE_KEY])).toEqual([]);
    expect(await repo.actionsForLocations([loc], [TEMPLATE_KEY])).toEqual([]);
  });

  it("a retracted verified row does NOT exclude an otherwise-eligible action", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const jobId = await job(ws, loc);
    const snap = await snapshot(ws, jobId, loc);
    const act = await action(ws, loc, snap);
    await assertion(ws, act, "owner_asserted"); // live engagement
    // A verified row exists but is retracted: it must not stand as a permanent
    // exclusion. This is the more consequential of the two retracted_at gaps --
    // the verified exclusion has no throttle behind it, so a retracted row that
    // still counted would hide the action from verification forever.
    await assertion(ws, act, "verified", { retractedAt: new Date().toISOString() });

    const repo = verificationRepository(runtime);
    expect((await repo.dueLocations(10, [TEMPLATE_KEY])).map((d) => d.location_id)).toEqual([loc]);
    expect((await repo.actionsForLocations([loc], [TEMPLATE_KEY])).map((a) => a.id)).toEqual([act]);
  });

  it("does NOT return a location whose website_url is null, the empty string, or whitespace-only, otherwise fully eligible", async () => {
    const ws = await workspace();
    const locNull = await location(ws, null);
    const locEmpty = await location(ws, "");
    const locBlank = await location(ws, "   ");
    const jobNull = await job(ws, locNull);
    const jobEmpty = await job(ws, locEmpty);
    const jobBlank = await job(ws, locBlank);
    const snapNull = await snapshot(ws, jobNull, locNull);
    const snapEmpty = await snapshot(ws, jobEmpty, locEmpty);
    const snapBlank = await snapshot(ws, jobBlank, locBlank);
    const actNull = await action(ws, locNull, snapNull);
    const actEmpty = await action(ws, locEmpty, snapEmpty);
    const actBlank = await action(ws, locBlank, snapBlank);
    await assertion(ws, actNull, "owner_asserted");
    await assertion(ws, actEmpty, "owner_asserted");
    await assertion(ws, actBlank, "owner_asserted");

    const repo = verificationRepository(runtime);
    expect(await repo.dueLocations(10, [TEMPLATE_KEY])).toEqual([]);
  });

  it("does NOT return a location whose action has no source_snapshot_id, otherwise fully eligible -- and actionsForLocations independently gives back nothing for it", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    await job(ws, loc);
    // No snapshot: the action's source_snapshot_id is left null.
    const act = await action(ws, loc, null);
    await assertion(ws, act, "owner_asserted");

    const repo = verificationRepository(runtime);
    expect(await repo.dueLocations(10, [TEMPLATE_KEY])).toEqual([]);
    // Pin the asymmetry: actionsForLocations INNER JOINs scan_snapshots, so
    // even if dueLocations' own filter were dropped and this location were
    // (wrongly) selected, the second query would still yield nothing for it --
    // the sweep would then fetch this location's website for no reason, every
    // tick, forever. This must not be "fixed" by deleting the IS NOT NULL
    // check from ELIGIBLE on the grounds that the join already handles it:
    // dueLocations has no such join and needs its own guard.
    expect(await repo.actionsForLocations([loc], [TEMPLATE_KEY])).toEqual([]);
  });

  // --- The 24h throttle ---------------------------------------------------

  it("excludes an action checked 1 hour ago and includes one checked 25 hours ago", async () => {
    const ws = await workspace();
    const locRecent = await location(ws);
    const locStale = await location(ws);
    const jobRecent = await job(ws, locRecent);
    const jobStale = await job(ws, locStale);
    const snapRecent = await snapshot(ws, jobRecent, locRecent);
    const snapStale = await snapshot(ws, jobStale, locStale);
    const actRecent = await action(ws, locRecent, snapRecent);
    const actStale = await action(ws, locStale, snapStale);
    await assertion(ws, actRecent, "owner_asserted");
    await assertion(ws, actStale, "owner_asserted");

    await runtime.query("UPDATE actions SET verification_checked_at = now() - interval '1 hour' WHERE id = $1", [actRecent]);
    await runtime.query("UPDATE actions SET verification_checked_at = now() - interval '25 hours' WHERE id = $1", [actStale]);

    const repo = verificationRepository(runtime);
    const due = await repo.dueLocations(10, [TEMPLATE_KEY]);
    expect(due.map((d) => d.location_id)).toEqual([locStale]);
    const actions = await repo.actionsForLocations([locRecent, locStale], [TEMPLATE_KEY]);
    expect(actions.map((a) => a.id)).toEqual([actStale]);
  });

  // --- markChecked ---------------------------------------------------------

  it("markChecked stamps only the ids passed, with the exact value given, paired with the right workspace_id", async () => {
    const ws = await workspace();
    const otherWs = await workspace();
    const loc = await location(ws);
    const jobId = await job(ws, loc);
    const snap = await snapshot(ws, jobId, loc);
    const act1 = await action(ws, loc, snap);
    const act2 = await action(ws, loc, snap);
    const act3 = await action(ws, loc, snap);
    await Promise.all([act1, act2, act3].map((id) => assertion(ws, id, "owner_asserted")));

    const repo = verificationRepository(runtime);
    const before = await repo.actionsForLocations([loc], [TEMPLATE_KEY]);
    expect(before.map((a) => a.id).sort()).toEqual([act1, act2, act3].sort());

    // Pre-stamp act3 with a sentinel distinct from both "never ran" (null, the
    // column default) and any value this test's own markChecked calls would
    // write -- only a sentinel lets "correctly skipped" be told apart from
    // "nothing ran", which asserting null cannot do.
    const sentinel = "2020-01-01T00:00:00.000Z";
    await runtime.query("UPDATE actions SET verification_checked_at=$1 WHERE id=$2", [sentinel, act3]);

    // A mismatched workspace_id must not stamp the action: the sentinel must
    // survive untouched.
    await repo.markChecked([{ id: act3, workspace_id: otherWs }], new Date().toISOString());
    const unchanged = (await runtime.query("SELECT verification_checked_at FROM actions WHERE id=$1", [act3])).rows[0].verification_checked_at;
    expect(new Date(unchanged).toISOString()).toBe(sentinel);

    // Only act1 and act2 passed with the correct pairing, and must be stamped
    // with EXACTLY the value passed in -- not a value the SQL reads
    // independently via its own now() (which is also what the 24h throttle
    // reads against; the write clock and the read clock must be the same
    // value here, not merely both non-null).
    const nowIso = new Date().toISOString();
    await repo.markChecked(
      [
        { id: act1, workspace_id: ws },
        { id: act2, workspace_id: ws },
      ],
      nowIso,
    );
    const rows = (await runtime.query("SELECT id,verification_checked_at FROM actions WHERE id = ANY($1::uuid[])", [[act1, act2, act3]])).rows;
    const stampedIds = new Set(rows.filter((r) => r.id !== act3).map((r) => r.id));
    expect(stampedIds).toEqual(new Set([act1, act2]));
    for (const row of rows) {
      if (row.id === act3) continue;
      expect(new Date(row.verification_checked_at).toISOString()).toBe(nowIso);
    }
  });

  // --- Fan-out: one location, several actions -----------------------------

  it("produces one location row from dueLocations and two action rows from actionsForLocations", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const jobId = await job(ws, loc);
    const snap = await snapshot(ws, jobId, loc);
    const act1 = await action(ws, loc, snap);
    const act2 = await action(ws, loc, snap);
    await assertion(ws, act1, "owner_asserted");
    await assertion(ws, act2, "owner_asserted");

    const repo = verificationRepository(runtime);
    expect(await repo.dueLocations(10, [TEMPLATE_KEY])).toHaveLength(1);
    const actions = await repo.actionsForLocations([loc], [TEMPLATE_KEY]);
    expect(actions.map((a) => a.id).sort()).toEqual([act1, act2].sort());
  });

  // --- The verifier seam: recordApplication({ source: 'verified' }) -------

  it("recordApplication with source 'verified' lands a row that forActions returns, with its evidence intact", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const jobId = await job(ws, loc);
    const snap = await snapshot(ws, jobId, loc);
    const act = await action(ws, loc, snap);

    const created = await recordApplication(applicationRepository(runtime), {
      workspaceId: ws,
      actionId: act,
      source: "verified",
      evidence: { check: "faq_schema" },
    });
    expect(created).not.toBeNull();

    const rows = await applicationRepository(runtime).forActions(ws, [act]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action_id: act, source: "verified" });

    // forActions does not project evidence (ApplicationRecord has no such
    // field) -- read it back directly to prove recordApplication did not
    // silently drop the payload. Carrying evidence through is the entire
    // point of the verifier seam, and this is its only exercise.
    const stored = (await runtime.query("SELECT evidence FROM action_applications WHERE id=$1", [created!.id])).rows[0].evidence;
    expect(stored).toEqual({ check: "faq_schema" });
  });

  // --- Ordering: never-checked beats mixed beats fully-checked -------------

  it("a never-checked location sorts ahead of a mixed location, which sorts ahead of a fully-checked location with an older oldest-check", async () => {
    const ws = await workspace();
    // Explicit ids, ascending opposite to the expected result order
    // (fullyChecked < mixed < neverChecked): with the min(...) tiebreaker
    // removed, ORDER BY falls through to `a.location_id` ascending, so a
    // random-uuid fixture would only fail this assertion by chance (observed
    // ~4/5 runs). Pinning the ids makes the mutation fail deterministically,
    // every run, because the fallback order is then guaranteed to be exactly
    // backwards from what is asserted.
    const locFullyChecked = await location(ws, undefined, "00000000-0000-0000-0000-000000000001");
    const locMixed = await location(ws, undefined, "00000000-0000-0000-0000-000000000002");
    const locNeverChecked = await location(ws, undefined, "00000000-0000-0000-0000-000000000003");
    const jobNever = await job(ws, locNeverChecked);
    const jobMixed = await job(ws, locMixed);
    const jobChecked = await job(ws, locFullyChecked);
    const snapNever = await snapshot(ws, jobNever, locNeverChecked);
    const snapMixed = await snapshot(ws, jobMixed, locMixed);
    const snapChecked = await snapshot(ws, jobChecked, locFullyChecked);

    // locNeverChecked: both actions' verification_checked_at stay null. This
    // is the within-group tiebreaker the doc comment promises: bool_or(...)
    // ties with locMixed (both have at least one never-checked action), so
    // min(...) ASC NULLS FIRST must decide, and a location whose min is NULL
    // (nothing checked at all) sorts ahead of one whose min is a real,
    // however-recent timestamp.
    const neverA = await action(ws, locNeverChecked, snapNever);
    const neverB = await action(ws, locNeverChecked, snapNever);
    await assertion(ws, neverA, "owner_asserted");
    await assertion(ws, neverB, "owner_asserted");

    // locMixed: one action never checked, one checked recently.
    const mixedUnchecked = await action(ws, locMixed, snapMixed);
    const mixedChecked = await action(ws, locMixed, snapMixed);
    await assertion(ws, mixedUnchecked, "owner_asserted");
    await assertion(ws, mixedChecked, "owner_asserted");
    await runtime.query("UPDATE actions SET verification_checked_at = now() - interval '30 hours' WHERE id = $1", [mixedChecked]);

    // locFullyChecked: every eligible action checked, and its oldest check is
    // OLDER than locMixed's checked action -- a naive `min(...) ASC NULLS
    // FIRST` alone (without the bool_or(...) DESC leading key) would put this
    // location ahead of locMixed. It must not.
    const fullyChecked = await action(ws, locFullyChecked, snapChecked);
    await assertion(ws, fullyChecked, "owner_asserted");
    await runtime.query("UPDATE actions SET verification_checked_at = now() - interval '100 hours' WHERE id = $1", [fullyChecked]);

    const repo = verificationRepository(runtime);
    const due = await repo.dueLocations(10, [TEMPLATE_KEY]);
    expect(due.map((d) => d.location_id)).toEqual([locNeverChecked, locMixed, locFullyChecked]);
  });

  // --- The loop-closing case: verified attribution, and its negative twin ---

  it("records an Attributed measurement with attribution_basis 'verified' when the verified row precedes the head job's start", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const { headSnapId, diffId } = await comparablePair(ws, loc);
    const act = await action(ws, loc, headSnapId, { actionState: "in_progress" });
    // Verified BEFORE the head job's created_at ('2026-09-01'), so it precedes
    // the scan whose numbers it is meant to explain.
    await assertion(ws, act, "verified", { assertedAt: "2026-08-15T00:00:00Z" });

    const head = await loadSnapshotRecord(headSnapId);
    const diff = await loadDiffRecord(diffId);
    const outcome = await recordMeasurements(measurementRepository(runtime), { headSnapshot: head, diff });
    expect(outcome).toEqual({ comparable: true, recorded: 1, skipped: 0 });

    const measurement = (
      await runtime.query("SELECT fact_type,attribution_basis,before_value::float,after_value::float FROM action_measurements WHERE action_id=$1", [act])
    ).rows[0];
    expect(measurement).toEqual({ fact_type: "Attributed", attribution_basis: "verified", before_value: 0, after_value: 2 });
  });

  // Negative twin of the case above. Without it, deleting the
  // `at >= headStartedAtMs` timing gate in strongestBasis
  // (lib/workspace/applications.ts) leaves every case in this file green --
  // the positive case only proves a verified row propagates to `Attributed`,
  // never that a LATE one is rejected. This is also the gate that fails open:
  // dropping the check means any verified row counts regardless of when it
  // was recorded relative to the scan it would be explaining.
  it("records an Observed measurement with no attribution when the verified row is dated AFTER the head job's start", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const { headSnapId, diffId } = await comparablePair(ws, loc);
    const act = await action(ws, loc, headSnapId, { actionState: "in_progress" });
    // The head job's created_at is '2026-09-01'; this assertion comes after
    // it, so it cannot explain that scan's numbers (Master Plan: no causal
    // claim from timing alone).
    await assertion(ws, act, "verified", { assertedAt: "2026-09-15T00:00:00Z" });

    const head = await loadSnapshotRecord(headSnapId);
    const diff = await loadDiffRecord(diffId);
    const outcome = await recordMeasurements(measurementRepository(runtime), { headSnapshot: head, diff });
    expect(outcome).toEqual({ comparable: true, recorded: 1, skipped: 0 });

    const measurement = (
      await runtime.query("SELECT fact_type,attribution_basis,before_value::float,after_value::float FROM action_measurements WHERE action_id=$1", [act])
    ).rows[0];
    expect(measurement).toEqual({ fact_type: "Observed", attribution_basis: null, before_value: 0, after_value: 2 });
  });
});
