import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { verificationRepository } from "../../lib/repositories/verification";
import { applicationRepository } from "../../lib/repositories/applications";
import { measurementRepository } from "../../lib/repositories/measurements";
import { recordApplication } from "../../lib/workspace/applications";
import { recordMeasurements } from "../../lib/workspace/measurements";
import { rowToSnapshot, type ScanDiffRow } from "../../lib/workspace/snapshots";

// The template used throughout: it declares `verifyChecks: ["faq_schema"]`
// (lib/workspace/templates.ts) and maps to metric "aeo.ai_citation_count"
// (lib/workspace/measurements.ts TEMPLATE_METRIC), which case 9 needs.
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

  async function user(): Promise<string> {
    return (await runtime.query("INSERT INTO app_users(email) VALUES($1) RETURNING id", [`${crypto.randomUUID()}@example.test`])).rows[0].id;
  }

  async function location(ws: string, websiteUrl: string | null = "https://example.test"): Promise<string> {
    return (
      await runtime.query("INSERT INTO locations(workspace_id,slug,name,website_url) VALUES($1,$2,'Fixture',$3) RETURNING id", [
        ws,
        `loc-${crypto.randomUUID()}`,
        websiteUrl,
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

  // --- Cases 1-4: the engagement + exclusion conditions -----------------

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

  // --- Case 5: the 24h throttle -------------------------------------------

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

  // --- Case 6: markChecked stamps only the ids passed, and is tenant-paired ---

  it("markChecked stamps only the ids passed, paired with the right workspace_id", async () => {
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

    // A mismatched workspace_id must not stamp the action.
    await repo.markChecked([{ id: act3, workspace_id: otherWs }], new Date().toISOString());
    expect((await runtime.query("SELECT verification_checked_at FROM actions WHERE id=$1", [act3])).rows[0].verification_checked_at).toBeNull();

    // Only act1 and act2 passed with the correct pairing.
    await repo.markChecked(
      [
        { id: act1, workspace_id: ws },
        { id: act2, workspace_id: ws },
      ],
      new Date().toISOString(),
    );
    const rows = (await runtime.query("SELECT id,verification_checked_at FROM actions WHERE id = ANY($1::uuid[])", [[act1, act2, act3]])).rows;
    const stamped = new Set(rows.filter((r) => r.verification_checked_at !== null).map((r) => r.id));
    expect(stamped).toEqual(new Set([act1, act2]));
  });

  // --- Case 7: one location, two actions --------------------------------

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

  // --- Case 8: recordApplication with source: 'verified' -----------------

  it("recordApplication with source 'verified' lands a row that forActions returns", async () => {
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
  });

  // --- The ordering case: mix wins over fully-checked, regardless of age ---

  it("a location with a mix of never-checked and already-checked actions sorts ahead of a fully-checked location with an older oldest-check", async () => {
    const ws = await workspace();
    const locMixed = await location(ws);
    const locFullyChecked = await location(ws);
    const jobMixed = await job(ws, locMixed);
    const jobChecked = await job(ws, locFullyChecked);
    const snapMixed = await snapshot(ws, jobMixed, locMixed);
    const snapChecked = await snapshot(ws, jobChecked, locFullyChecked);

    // locMixed: one action never checked, one checked recently.
    const mixedUnchecked = await action(ws, locMixed, snapMixed);
    const mixedChecked = await action(ws, locMixed, snapMixed);
    await assertion(ws, mixedUnchecked, "owner_asserted");
    await assertion(ws, mixedChecked, "owner_asserted");
    await runtime.query("UPDATE actions SET verification_checked_at = now() - interval '30 hours' WHERE id = $1", [mixedChecked]);

    // locFullyChecked: every eligible action checked, and its oldest check is
    // OLDER than locMixed's checked action -- a naive `min(...) ASC NULLS
    // FIRST` would put this location first. bool_or(...) DESC must not.
    const fullyChecked = await action(ws, locFullyChecked, snapChecked);
    await assertion(ws, fullyChecked, "owner_asserted");
    await runtime.query("UPDATE actions SET verification_checked_at = now() - interval '100 hours' WHERE id = $1", [fullyChecked]);

    const repo = verificationRepository(runtime);
    const due = await repo.dueLocations(10, [TEMPLATE_KEY]);
    expect(due.map((d) => d.location_id)).toEqual([locMixed, locFullyChecked]);
  });

  // --- Case 9: the loop-closing case ---------------------------------------

  it("records an Attributed measurement with attribution_basis 'verified' when a verified row precedes a comparable head scan", async () => {
    const ws = await workspace();
    const loc = await location(ws);
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

    const act = await action(ws, loc, headSnapId, { actionState: "in_progress" });
    // Verified BEFORE the head job's created_at ('2026-09-01'), so it precedes
    // the scan whose numbers it is meant to explain.
    await assertion(ws, act, "verified", { assertedAt: "2026-08-15T00:00:00Z" });

    const headSnapRow = (await runtime.query("SELECT * FROM scan_snapshots WHERE id=$1", [headSnapId])).rows[0];
    const head = rowToSnapshot({
      id: headSnapRow.id,
      job_id: headSnapRow.job_id,
      workspace_id: headSnapRow.workspace_id,
      location_id: headSnapRow.location_id,
      market: headSnapRow.market,
      observed_at: headSnapRow.observed_at.toISOString?.() ?? headSnapRow.observed_at,
      scoring_version: headSnapRow.scoring_version,
      overall_score: headSnapRow.overall_score,
      coverage: headSnapRow.coverage,
      module_states: headSnapRow.module_states,
      metrics: headSnapRow.metrics,
      website_checks: headSnapRow.website_checks,
      comparable_to: headSnapRow.comparable_to,
      diff_id: headSnapRow.diff_id,
      created_at: headSnapRow.created_at.toISOString?.() ?? headSnapRow.created_at,
    });
    const diffRow = (await runtime.query("SELECT * FROM scan_diffs WHERE id=$1", [diffId])).rows[0];
    const diff: ScanDiffRow = {
      id: diffRow.id,
      base_job_id: diffRow.base_job_id,
      head_job_id: diffRow.head_job_id,
      comparable: diffRow.comparable,
      incomparable_reason: diffRow.incomparable_reason,
      composite_withheld_reason: diffRow.composite_withheld_reason,
      intersection_modules: diffRow.intersection_modules,
      composite_base: diffRow.composite_base,
      composite_head: diffRow.composite_head,
      composite_delta: diffRow.composite_delta,
      resolved_findings: diffRow.resolved_findings,
      regressed_findings: diffRow.regressed_findings,
      decayed_findings: diffRow.decayed_findings,
      lost_coverage: diffRow.lost_coverage,
      gained_coverage: diffRow.gained_coverage,
      created_at: diffRow.created_at.toISOString?.() ?? diffRow.created_at,
    };

    const outcome = await recordMeasurements(measurementRepository(runtime), { headSnapshot: head, diff });
    expect(outcome).toEqual({ comparable: true, recorded: 1, skipped: 0 });

    const measurement = (
      await runtime.query("SELECT fact_type,attribution_basis,before_value::float,after_value::float FROM action_measurements WHERE action_id=$1", [act])
    ).rows[0];
    expect(measurement).toEqual({ fact_type: "Attributed", attribution_basis: "verified", before_value: 0, after_value: 2 });
  });
});
