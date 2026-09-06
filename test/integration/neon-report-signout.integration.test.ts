import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { reportsRepository } from "../../lib/repositories/reports";
import { authorizeReport } from "../../lib/report-access/authorize-report";
import { createViewerToken } from "../../lib/report-access/token";
import { POST } from "../../app/api/report-access/sign-out/route";
const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock("../../lib/db/client", () => ({ getPool: () => ports.pool }));
vi.mock("../../lib/auth", () => ({ signOut: vi.fn() }));
describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon report sign-out", () => {
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
  afterAll(async () => { await Promise.all([owner?.end(), runtime?.end()]); fixture?.stop(); });
  async function grant() {
    const jobId = (await runtime.query("INSERT INTO audit_jobs(business_name) VALUES('Sign-out fixture') RETURNING id")).rows[0].id as string;
    const token = createViewerToken();
    const id = (await runtime.query("INSERT INTO report_access_grants(job_id,token_hash,idempotency_key,purpose,expires_at) VALUES($1,$2,$3,'report_view',now()+interval '1 day') RETURNING id", [jobId, token.tokenHash, crypto.randomUUID()])).rows[0].id as string;
    return { id, jobId, token };
  }
  it("binds revocation to both id and token hash and preserves an existing revocation timestamp", async () => {
    const first = await grant(), other = await grant(), repo = reportsRepository(runtime);
    await repo.revokeViewerGrant(first.id, other.token.tokenHash);
    await repo.revokeViewerGrant(other.id, first.token.tokenHash);
    await repo.revokeViewerGrant("00000000-0000-4000-8000-000000000001", first.token.tokenHash);
    expect((await repo.findViewerGrant(first.jobId, first.id))?.revoked_at).toBeNull();
    expect((await repo.findViewerGrant(other.jobId, other.id))?.revoked_at).toBeNull();
    await repo.revokeViewerGrant(first.id, first.token.tokenHash);
    expect((await repo.findViewerGrant(first.jobId, first.id))?.revoked_at).toEqual(expect.any(String));
    await runtime.query("UPDATE report_access_grants SET revoked_at='2026-01-01T00:00:00Z' WHERE id=$1", [first.id]);
    const previous = (await repo.findViewerGrant(first.jobId, first.id))?.revoked_at;
    await repo.revokeViewerGrant(first.id, first.token.tokenHash);
    expect((await repo.findViewerGrant(first.jobId, first.id))?.revoked_at).toBe(previous);
    expect((await repo.findViewerGrant(other.jobId, other.id))?.revoked_at).toBeNull();
  });
  it("revokes through the actual route so a captured cookie loses report authorization", async () => {
    const saved = await grant(), repo = reportsRepository(runtime);
    const access = () => authorizeReport({ job: { id: saved.jobId }, staffUser: null, viewerToken: { grantId: saved.id, rawToken: saved.token.rawToken }, lookupGrant: id => repo.findViewerGrant(saved.jobId, id) });
    expect(await access()).toEqual({ kind: "viewer", grantId: saved.id });
    const response = await POST(new Request("https://fixture.test/api/report-access/sign-out", { method: "POST", headers: { cookie: `sme_report_grant=${saved.id}.${saved.token.rawToken}` } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toContain("sme_report_grant=;");
    expect(await access()).toEqual({ kind: "public" });
  });
  it("sanitizes repository SQL errors", async () => {
    const closed = new Pool({ connectionString: fixture.databaseUrl });
    await closed.end();
    await expect(reportsRepository(closed).revokeViewerGrant(crypto.randomUUID(), "fixture-hash")).rejects.toThrow(/^report_persistence_unavailable$/);
  });
});
