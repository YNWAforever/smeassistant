import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { failuresRepository, type FailureQuery } from "../../lib/repositories/failures";

const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock("../../lib/db/client", () => ({ getPool: () => ports.pool, getDatabase: () => drizzle(ports.pool!) }));

const ALL: FailureQuery = { kinds: null, hexPrefix: null, uuid: null, workspaceId: null, limit: 200 };

describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon failures read model", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;
  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href });
    ports.pool = runtime;
  });
  beforeEach(async () => {
    await runtime.query("DELETE FROM audit_events; DELETE FROM audit_jobs; DELETE FROM workspaces; DELETE FROM app_users");
  });
  afterAll(async () => {
    await Promise.all([owner?.end(), runtime?.end()]);
    fixture?.stop();
  });

  const repo = () => failuresRepository(runtime);
  const workspace = async (name = "Kam Man House") =>
    (await runtime.query("INSERT INTO workspaces(slug,business_name,market,tier) VALUES($1,$2,'hk','paid') RETURNING id", [`ws-${randomUUID().slice(0, 8)}`, name])).rows[0].id as string;
  const location = async (ws: string, slug = "tin-hau") =>
    (await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,$2,$3) RETURNING id", [ws, slug, slug])).rows[0].id as string;
  const job = async (opts: { status: string; attempts?: number; lastAttempt?: string | null; completed?: string | null; category?: string | null; ws?: string | null; loc?: string | null }) =>
    (await runtime.query(
      `INSERT INTO audit_jobs(business_name,status,attempt_count,last_attempt_at,completed_at,failure_category,failure_correlation_id,workspace_id,location_id)
       VALUES('Kam Man House',$1,$2,CASE WHEN $3::text IS NULL THEN NULL ELSE now()-$3::interval END,CASE WHEN $4::text IS NULL THEN NULL ELSE now()-$4::interval END,$5,CASE WHEN $5::text IS NULL THEN NULL ELSE gen_random_uuid() END,$6,$7) RETURNING id`,
      [opts.status, opts.attempts ?? 0, opts.lastAttempt ?? null, opts.completed ?? null, opts.category ?? null, opts.ws ?? null, opts.loc ?? null],
    )).rows[0].id as string;
  const action = async (ws: string, loc: string | null = null) =>
    (await runtime.query(
      "INSERT INTO actions(workspace_id,location_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key) VALUES($1,$2,'review-response','{}','{}','[]','low',1,'{}',5,'Live',$3) RETURNING id",
      [ws, loc, randomUUID()],
    )).rows[0].id as string;
  const run = async (ws: string, act: string, state: string, age = "1 hour", input: object | null = null, error: string | null = null) =>
    (await runtime.query(
      "INSERT INTO action_runs(workspace_id,action_id,agent_key,state,input,error,created_at,finished_at) VALUES($1,$2,'review_reply',$3,$4,$5,now()-$6::interval,now()-$6::interval) RETURNING id",
      [ws, act, state, input ? JSON.stringify(input) : null, error, age],
    )).rows[0].id as string;
  const runEvent = (ws: string, runId: string, event: string, reason: string) =>
    runtime.query("INSERT INTO audit_events(workspace_id,actor_type,event,entity_type,entity_id,payload) VALUES($1,'system',$2,'action_run',$3,$4)", [ws, event, runId, JSON.stringify({ reason })]);
  const connection = async (ws: string, status: string, age = "1 hour") =>
    (await runtime.query(
      "INSERT INTO oauth_connections(workspace_id,provider,access_token_encrypted,status,updated_at) VALUES($1,'google_gbp','x',$2,now()-$3::interval) RETURNING id",
      [ws, status, age],
    )).rows[0].id as string;
  const kinds = async (query: Partial<FailureQuery> = {}) => (await repo().list({ ...ALL, ...query })).map((item) => item.kind).sort();

  it("lists failed scans within 30 days, with the category and correlation id", async () => {
    const recent = await job({ status: "failed", completed: "2 days", category: "COLLECTION_FAILED" });
    const nearBoundary = await job({ status: "failed", completed: "29 days", category: "COLLECTION_FAILED" });
    await job({ status: "failed", completed: "31 days", category: "COLLECTION_FAILED" });
    await job({ status: "done", completed: "1 day" });
    const items = await repo().list(ALL);
    expect(items.map((item) => item.id)).toEqual([recent, nearBoundary]);
    expect(items[0]).toMatchObject({ kind: "scan_failed", id: recent, reason: "COLLECTION_FAILED", businessName: "Kam Man House", operatorAction: "none" });
    expect(items[0].reference).toMatch(/^SCAN-[0-9A-F]{6}$/);
    expect(items[0].correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("lists dead-lettered scans with the release action, and not claimable ones", async () => {
    const dead = await job({ status: "collecting", attempts: 3, lastAttempt: "40 minutes" });
    await job({ status: "collecting", attempts: 2, lastAttempt: "40 minutes" });
    await job({ status: "collecting", attempts: 3, lastAttempt: "10 minutes" });
    const items = await repo().list(ALL);
    expect(items).toEqual([expect.objectContaining({ kind: "scan_dead_lettered", id: dead, reason: "ATTEMPTS_EXHAUSTED", attempts: 3, operatorAction: "release" })]);
  });

  it("lists one failed draft per action with its audit reason, drops it after a later success, and ignores assistant drafts", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const failing = await action(ws, loc);
    await run(ws, failing, "failed", "3 hours");
    const newest = await run(ws, failing, "timed_out", "2 hours");
    await runEvent(ws, newest, "run.timed_out", "action_run_reaped");
    const recovered = await action(ws);
    await run(ws, recovered, "failed", "3 hours");
    await run(ws, recovered, "succeeded", "1 hour");
    const assistant = await action(ws);
    await run(ws, assistant, "failed", "1 hour", { source: "assistant" }, "invalid_output");
    const nearBoundaryAction = await action(ws);
    const nearBoundaryRun = await run(ws, nearBoundaryAction, "failed", "13 days");
    const old = await action(ws);
    await run(ws, old, "failed", "15 days");
    const items = await repo().list(ALL);
    expect(items).toEqual([
      expect.objectContaining({ kind: "draft_failed", id: newest, actionId: failing, locationId: loc, reason: "action_run_reaped" }),
      expect.objectContaining({ kind: "draft_failed", id: nearBoundaryRun, actionId: nearBoundaryAction, reason: "action_run_failed" }),
    ]);
    expect(items[0].reference).toMatch(/^RUN-/);
  });

  it("falls back to action_run_failed when a failed run has no audit reason", async () => {
    const ws = await workspace();
    await run(ws, await action(ws), "failed");
    expect((await repo().list(ALL))[0].reason).toBe("action_run_failed");
  });

  it("keeps a failed draft failed when only a later assistant run recovers it", async () => {
    const ws = await workspace();
    const act = await action(ws);
    await run(ws, act, "failed", "3 hours");
    const failing = await run(ws, act, "failed", "2 hours");
    await run(ws, act, "succeeded", "1 hour", { source: "assistant" });
    const items = await repo().list(ALL);
    expect(items).toEqual([expect.objectContaining({ kind: "draft_failed", id: failing, actionId: act })]);
  });

  it("does not let a search on an older, superseded draft failure bypass the newest-wins rule", async () => {
    const ws = await workspace();
    const act = await action(ws);
    const older = await run(ws, act, "failed", "3 hours");
    const newer = await run(ws, act, "failed", "2 hours");
    expect(await repo().list({ ...ALL, uuid: older })).toEqual([]);
    const byNewer = await repo().list({ ...ALL, uuid: newer });
    expect(byNewer).toEqual([expect.objectContaining({ kind: "draft_failed", id: newer, actionId: act })]);
  });

  it("lists a broken Google connection only when it is the newest non-active row and no active one exists", async () => {
    const broken = await workspace("Broken");
    await connection(broken, "error");
    const healed = await workspace("Healed");
    await connection(healed, "error", "2 hours");
    await connection(healed, "active");
    const disconnected = await workspace("Disconnected");
    await connection(disconnected, "error", "2 hours");
    await connection(disconnected, "revoked", "1 hour");
    const items = await repo().list(ALL);
    expect(items).toEqual([expect.objectContaining({ kind: "google_connection", reason: "error", businessName: "Broken", locationId: null })]);
    expect(items[0].workspace).toMatchObject({ id: broken, name: "Broken" });
  });

  it("does not let a search on an older, superseded Google connection bypass the newest-wins rule", async () => {
    const ws = await workspace();
    const olderError = await connection(ws, "error", "2 hours");
    await connection(ws, "revoked", "1 hour");
    expect(await repo().list({ ...ALL, uuid: olderError })).toEqual([]);
    const prefix = olderError.replace(/-/g, "").slice(0, 6);
    expect(await repo().list({ ...ALL, hexPrefix: prefix })).toEqual([]);
  });

  it("lists post-processing stuck in retry after three attempts", async () => {
    const ws = await workspace();
    const stuck = await job({ status: "done", ws });
    const fresh = await job({ status: "done", ws });
    await runtime.query("INSERT INTO workspace_scan_completions(job_id,workspace_id,state,attempts,last_error) VALUES($1,$3,'retry',3,'workspace_post_process_failed'),($2,$3,'retry',1,'workspace_post_process_failed')", [stuck, fresh, ws]);
    expect(await repo().list(ALL)).toEqual([expect.objectContaining({ kind: "workspace_processing", id: stuck, attempts: 3, reason: "workspace_post_process_failed" })]);
  });

  it("filters by workspace, by kind, by reference prefix and by full id or correlation id", async () => {
    const mine = await workspace("Mine");
    const other = await workspace("Other");
    const failed = await job({ status: "failed", completed: "1 hour", category: "SCORING_FAILED", ws: mine });
    await job({ status: "failed", completed: "1 hour", category: "SCORING_FAILED", ws: other });
    await connection(mine, "expired");
    expect(await kinds({ workspaceId: mine })).toEqual(["google_connection", "scan_failed"]);
    expect(await kinds({ workspaceId: mine, kinds: ["scan_failed"] })).toEqual(["scan_failed"]);
    const prefix = failed.replace(/-/g, "").slice(0, 6);
    expect((await repo().list({ ...ALL, kinds: ["scan_failed"], hexPrefix: prefix })).map((item) => item.id)).toEqual([failed]);
    expect((await repo().list({ ...ALL, uuid: failed })).map((item) => item.id)).toEqual([failed]);
    const correlation = (await runtime.query("SELECT failure_correlation_id::text AS id FROM audit_jobs WHERE id=$1", [failed])).rows[0].id;
    expect((await repo().list({ ...ALL, uuid: correlation })).map((item) => item.id)).toEqual([failed]);
  });

  it("never returns personal fields", async () => {
    const ws = await workspace();
    await runtime.query("INSERT INTO app_users(email) VALUES('secret-owner@example.test')");
    await runtime.query("INSERT INTO workspace_members(workspace_id,email,role) VALUES($1,'secret-member@example.test','owner')", [ws]);
    const failedRun = await run(ws, await action(ws), "failed", "1 hour", { prompt: "SECRET-REVIEW-TEXT" }, "SECRET-ERROR-TEXT");
    await runtime.query("UPDATE action_runs SET output=$2 WHERE id=$1", [failedRun, JSON.stringify({ draft: "SECRET-OUTPUT" })]);
    await runtime.query(
      "INSERT INTO audit_events(workspace_id,actor_type,event,entity_type,entity_id,payload) VALUES($1,'system','run.failed','action_run',$2,$3)",
      [ws, failedRun, JSON.stringify({ reason: "action_run_failed", secret_note: "SECRET-AUDIT-PAYLOAD" })],
    );
    const failedJob = await job({ status: "failed", completed: "1 hour", category: "COLLECTION_FAILED", ws });
    await runtime.query("UPDATE audit_jobs SET raw_data=$2 WHERE id=$1", [failedJob, JSON.stringify({ review: "SECRET-RAW-REVIEW" })]);
    const serialized = JSON.stringify(await repo().list(ALL));
    for (const secret of ["secret-owner", "secret-member", "SECRET-REVIEW-TEXT", "SECRET-ERROR-TEXT", "SECRET-AUDIT-PAYLOAD", "SECRET-RAW-REVIEW", "SECRET-OUTPUT"])
      expect(serialized).not.toContain(secret);
  });

  it("summarizes health: recent counts, open counts and failed scans by category", async () => {
    const ws = await workspace();
    await job({ status: "failed", completed: "1 hour", category: "COLLECTION_FAILED" });
    await job({ status: "failed", completed: "3 days", category: "COLLECTION_FAILED" });
    await job({ status: "failed", completed: "2 hours", category: "SCORING_FAILED" });
    await job({ status: "collecting", attempts: 3, lastAttempt: "2 hours" });
    await connection(ws, "error");
    await run(ws, await action(ws), "failed", "1 hour");
    const health = await repo().health();
    expect(health.recent).toEqual({ scan_failed: { day: 2, week: 3 }, draft_failed: { day: 1, week: 1 } });
    expect(health.open).toEqual({ scan_dead_lettered: 1, google_connection: 1, workspace_processing: 0 });
    expect(health.categories).toEqual([{ category: "COLLECTION_FAILED", day: 1, week: 2 }, { category: "SCORING_FAILED", day: 1, week: 1 }]);
  });
});
