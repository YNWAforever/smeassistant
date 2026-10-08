import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { buildScanStartPayload, emptyScanDraft } from "../../lib/funnel/scan-start";
import { LEGAL_POLICY_VERSION } from "../../lib/legal/policy";

/**
 * F-13: a public scan start is retry-safe. A lost response, a double click or
 * a back-then-resubmit of the same submission must land on the job that was
 * already created, never queue a second paid scan or admit it twice against
 * the spend budget. Runs the real route, repository and SQL on an owned DB.
 */
const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock("../../lib/db/client", () => ({ getPool: () => ports.pool, getDatabase: () => drizzle(ports.pool!) }));
vi.mock("../../lib/analytics/record-event", async () => {
  const actual = await vi.importActual<typeof import("../../lib/analytics/record-event")>("../../lib/analytics/record-event");
  return { ...actual, forwardEventToPostHog: vi.fn(async () => {}) };
});
// The scan_start limiter has its own atomic-limit test; here it would refuse
// the eleventh request of the file, which is not what these cases are about.
vi.mock("../../lib/security/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("../../lib/security/rate-limit")>("../../lib/security/rate-limit");
  return { ...actual, enforceRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })) };
});
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: vi.fn() }));

const KEY_A = "A".repeat(43);
const KEY_B = "B".repeat(43);
const KEY_C = "C".repeat(43);
const KEY_D = "D".repeat(43);
const KEY_E = "E".repeat(43);

function payload(businessName: string, submissionKey?: string) {
  const base = buildScanStartPayload(
    { ...emptyScanDraft("hk", businessName), manualEntry: true, industry: "fnb", district: "東區" },
    "zh-HK",
    { granted: true, policyVersion: LEGAL_POLICY_VERSION },
  );
  return submissionKey ? { ...base, submission_key: submissionKey } : base;
}

describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon retry-safe scan start (F-13)", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;
  let POST: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE submission_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl);
    url.username = "submission_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href });
    ports.pool = runtime;
    ({ POST } = await import("../../app/api/scan/start/route"));
  });
  afterAll(async () => { await Promise.all([owner?.end(), runtime?.end()]); fixture?.stop(); });

  const start = (body: unknown) => POST(new Request("https://fixture.test/api/scan/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  const jobsNamed = async (name: string) => (await runtime.query<{ id: string }>("SELECT id FROM audit_jobs WHERE business_name=$1", [name])).rows;

  it("replays a retried submission to the same job without a second job, consent or event", async () => {
    const first = await start(payload("Retry fixture", KEY_A));
    expect(first.status).toBe(200);
    const { jobId } = await first.json();
    const retry = await start(payload("Retry fixture", KEY_A));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ jobId, replayed: true });
    expect(await jobsNamed("Retry fixture")).toEqual([{ id: jobId }]);
    expect((await runtime.query("SELECT id FROM consent_records WHERE job_id=$1", [jobId])).rows).toHaveLength(1);
    expect((await runtime.query("SELECT id FROM scan_events WHERE job_id=$1 AND event_name='scan_started'", [jobId])).rows).toHaveLength(1);
    const audit = (await runtime.query("SELECT workspace_id,actor_type,actor_id,event,entity_type,entity_id FROM audit_events WHERE entity_id=$1", [jobId])).rows;
    expect(audit).toEqual([{ workspace_id: null, actor_type: "user", actor_id: null, event: "scan.queued", entity_type: "audit_job", entity_id: jobId }]);
  });

  it("collapses concurrent duplicate submissions to one job", async () => {
    const responses = await Promise.all(Array.from({ length: 5 }, () => start(payload("Concurrent fixture", KEY_B))));
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    const ids = new Set((await Promise.all(responses.map((r) => r.json()))).map((b: { jobId: string }) => b.jobId));
    expect(ids.size).toBe(1);
    expect(await jobsNamed("Concurrent fixture")).toHaveLength(1);
  });

  it("refuses a reused key carrying a different submission, without writing", async () => {
    expect((await start(payload("Original fixture", KEY_C))).status).toBe(200);
    const reused = await start(payload("Different fixture", KEY_C));
    expect(reused.status).toBe(409);
    expect(await reused.json()).toEqual({ error: "submission_key_conflict" });
    expect(await jobsNamed("Different fixture")).toHaveLength(0);
  });

  it("still creates a new scan for a fresh key, and for a client that sends none", async () => {
    expect((await start(payload("Fresh fixture", KEY_D))).status).toBe(200);
    expect((await start(payload("Fresh fixture", KEY_E))).status).toBe(200);
    expect((await start(payload("Fresh fixture"))).status).toBe(200);
    expect(await jobsNamed("Fresh fixture")).toHaveLength(3);
  });
});
