import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { reportRecoveryRepository } from "../../lib/repositories/report-recovery";
import { reportsRepository } from "../../lib/repositories/reports";
import { claimsRepository } from "../../lib/repositories/claims";
import { createIdempotencyKey, createViewerToken } from "../../lib/report-access/token";
const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock("../../lib/db/client", () => ({ getPool: () => ports.pool }));
describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon report recovery grants", () => {
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

  /** A job plus a viewer_report grant addressed to owner@example.com, as unlock writes it. */
  async function seed(grant: { email?: string | null; revoked?: boolean; expired?: boolean } = {}) {
    const slug = `recovery-${crypto.randomUUID()}`;
    const jobId = (await runtime.query("INSERT INTO audit_jobs(business_name,share_slug) VALUES('Recovery fixture',$1) RETURNING id", [slug])).rows[0].id as string;
    const token = createViewerToken();
    await runtime.query(
      "INSERT INTO report_access_grants(job_id,token_hash,idempotency_key,purpose,email_normalized,expires_at,revoked_at) VALUES($1,$2,$3,'viewer_report',$4,now()+($5::text)::interval,CASE WHEN $6 THEN now() END)",
      [jobId, token.tokenHash, createIdempotencyKey(), grant.email === undefined ? "owner@example.com" : grant.email, grant.expired ? "-1 day" : "30 days", grant.revoked ?? false],
    );
    return { slug, jobId };
  }
  async function recovery(jobId: string) {
    const token = createViewerToken();
    const { grantId } = await reportRecoveryRepository.insertRecoveryGrant(jobId, token.tokenHash);
    return { grantId, token };
  }
  const viewer = () => ({ tokenHash: createViewerToken().tokenHash, idempotencyKey: createIdempotencyKey() });

  it("matches a recipient by trimmed, case-insensitive email, including an expired viewer grant", async () => {
    const live = await seed();
    expect(await reportRecoveryRepository.findRecipientGrant(live.slug, " Owner@Example.com ")).toEqual({ jobId: live.jobId, workspaceId: null, businessName: "Recovery fixture" });
    expect(await reportRecoveryRepository.findRecipientGrant(live.slug, "other@example.com")).toBeNull();
    expect(await reportRecoveryRepository.findRecipientGrant("missing-slug", "owner@example.com")).toBeNull();
    const revoked = await seed({ revoked: true });
    expect(await reportRecoveryRepository.findRecipientGrant(revoked.slug, "owner@example.com")).toBeNull();
    const expired = await seed({ expired: true });
    expect(await reportRecoveryRepository.findRecipientGrant(expired.slug, "owner@example.com")).toEqual({ jobId: expired.jobId, workspaceId: null, businessName: "Recovery fixture" });
  });

  it("does not match a recovery row or a non-viewer purpose", async () => {
    const job = await seed({ email: null });
    await recovery(job.jobId);
    await runtime.query("INSERT INTO report_access_grants(job_id,token_hash,idempotency_key,purpose,email_normalized,expires_at) VALUES($1,$2,$3,'report_view','owner@example.com',now()+interval '1 day')", [job.jobId, createViewerToken().tokenHash, createIdempotencyKey()]);
    expect(await reportRecoveryRepository.findRecipientGrant(job.slug, "owner@example.com")).toBeNull();
  });

  it("stores recovery rows without an address, so lead eligibility is unchanged", async () => {
    const job = await seed();
    const before = await claimsRepository.isLeadRecipient(job.slug, "owner@example.com");
    const strangerBefore = await claimsRepository.isLeadRecipient(job.slug, "stranger@example.com");
    const { grantId } = await recovery(job.jobId);
    const row = (await runtime.query("SELECT purpose,email_normalized,lead_id,expires_at > now() + interval '59 minutes' AS long_enough,expires_at <= now() + interval '60 minutes' AS short_enough FROM report_access_grants WHERE id=$1", [grantId])).rows[0];
    expect(row).toEqual({ purpose: "report_recovery", email_normalized: null, lead_id: null, long_enough: true, short_enough: true });
    const redeemed = await reportRecoveryRepository.redeemRecoveryGrant((await recovery(job.jobId)).token.tokenHash, viewer());
    expect(redeemed).not.toBeNull();
    expect((await runtime.query("SELECT email_normalized,lead_id FROM report_access_grants WHERE id=$1", [redeemed!.grantId])).rows[0]).toEqual({ email_normalized: null, lead_id: null });
    expect(await claimsRepository.isLeadRecipient(job.slug, "owner@example.com")).toBe(before);
    expect(await claimsRepository.isLeadRecipient(job.slug, "stranger@example.com")).toBe(strangerBefore);
  });

  it("never lets a recovery row act as a viewer grant", async () => {
    const job = await seed();
    const { grantId } = await recovery(job.jobId);
    expect(await reportsRepository(runtime).findViewerGrant(job.jobId, grantId)).toBeNull();
  });

  it("redeems once into a 30-day viewer grant and refuses a second redeem", async () => {
    const job = await seed();
    const { token } = await recovery(job.jobId);
    const fresh = viewer();
    const redeemed = await reportRecoveryRepository.redeemRecoveryGrant(token.tokenHash, fresh);
    expect(redeemed).toEqual({ grantId: expect.any(String), jobId: job.jobId, slug: job.slug, workspaceId: null });
    const found = await reportsRepository(runtime).findViewerGrant(job.jobId, redeemed!.grantId);
    expect(found).toMatchObject({ id: redeemed!.grantId, job_id: job.jobId, token_hash: fresh.tokenHash, revoked_at: null });
    const row = (await runtime.query("SELECT purpose,idempotency_key,expires_at > now() + interval '29 days' AS thirty_days,expires_at <= now() + interval '30 days' AS not_more FROM report_access_grants WHERE id=$1", [redeemed!.grantId])).rows[0];
    expect(row).toEqual({ purpose: "viewer_report", idempotency_key: fresh.idempotencyKey, thirty_days: true, not_more: true });
    expect(await reportRecoveryRepository.redeemRecoveryGrant(token.tokenHash, viewer())).toBeNull();
  });

  it("returns the job's workspace id with a redeemed grant", async () => {
    const job = await seed();
    const workspaceId = (await runtime.query("INSERT INTO workspaces(slug,market) VALUES($1,'hk') RETURNING id", [`ws-${crypto.randomUUID()}`])).rows[0].id as string;
    await runtime.query("UPDATE audit_jobs SET workspace_id=$1 WHERE id=$2", [workspaceId, job.jobId]);
    const { token } = await recovery(job.jobId);
    expect(await reportRecoveryRepository.redeemRecoveryGrant(token.tokenHash, viewer())).toEqual({ grantId: expect.any(String), jobId: job.jobId, slug: job.slug, workspaceId });
  });

  it("refuses an expired, revoked or unknown recovery token, and a viewer token presented as recovery", async () => {
    const job = await seed();
    const expired = await recovery(job.jobId);
    await runtime.query("UPDATE report_access_grants SET expires_at=now()-interval '1 minute' WHERE id=$1", [expired.grantId]);
    expect(await reportRecoveryRepository.redeemRecoveryGrant(expired.token.tokenHash, viewer())).toBeNull();
    const revoked = await recovery(job.jobId);
    await runtime.query("UPDATE report_access_grants SET revoked_at=now() WHERE id=$1", [revoked.grantId]);
    expect(await reportRecoveryRepository.redeemRecoveryGrant(revoked.token.tokenHash, viewer())).toBeNull();
    expect(await reportRecoveryRepository.redeemRecoveryGrant(createViewerToken().tokenHash, viewer())).toBeNull();
    const viewerHash = (await runtime.query("SELECT token_hash FROM report_access_grants WHERE job_id=$1 AND purpose='viewer_report'", [job.jobId])).rows[0].token_hash as string;
    expect(await reportRecoveryRepository.redeemRecoveryGrant(viewerHash, viewer())).toBeNull();
  });

  it("lets exactly one of two concurrent redeems win", async () => {
    const job = await seed();
    const { token } = await recovery(job.jobId);
    const results = await Promise.all([
      reportRecoveryRepository.redeemRecoveryGrant(token.tokenHash, viewer()),
      reportRecoveryRepository.redeemRecoveryGrant(token.tokenHash, viewer()),
    ]);
    expect(results.filter(result => result !== null)).toHaveLength(1);
    expect((await runtime.query("SELECT count(*)::int AS count FROM report_access_grants WHERE job_id=$1 AND purpose='viewer_report'", [job.jobId])).rows[0].count).toBe(2);
  });
});
