import { jobsRepository } from "../../lib/repositories/jobs";
import { enforceRateLimit } from "../../lib/security/rate-limit";
import { POST as unlock } from "../../app/api/report-access/unlock/route";
import { createViewerTokenFromIdempotencyKey } from "../../lib/report-access/token";
import { createReportStore } from "../../lib/report/store";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { buildScanStartPayload, emptyScanDraft } from "../../lib/funnel/scan-start";
import { parseScanStartBody, insertScanJob } from "../../lib/scan/start-job";
const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock("../../lib/db/client", () => ({ getPool: () => ports.pool, getDatabase: () => drizzle(ports.pool!) }));
vi.mock("../../lib/analytics/record-event", async () => {
    const actual = await vi.importActual<typeof import("../../lib/analytics/record-event")>("../../lib/analytics/record-event");
    return { ...actual, forwardEventToPostHog: vi.fn(async () => {}) };
});
describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon scan persistence", () => {
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
    it.each(["hk", "tw"] as const)("persists anonymous %s manual scans without trusting client attribution", async (market) => {
        const payload = buildScanStartPayload({ ...emptyScanDraft(market, "Fixture shop"), manualEntry: true, industry: "fnb", district: market === "hk" ? "東區" : "臺北市" }, market === "hk" ? "zh-HK" : "zh-TW");
        const parsed = parseScanStartBody({ ...payload, workspace_id: "00000000-0000-4000-8000-000000000001", location_id: "00000000-0000-4000-8000-000000000002" });
        expect(parsed.ok).toBe(true);
        if (!parsed.ok)
            throw Error("invalid fixture");
        const result = await insertScanJob(parsed.input);
        expect(result.ok).toBe(true);
        if (!result.ok)
            throw Error("insert failed");
        const row = (await runtime.query("SELECT * FROM audit_jobs WHERE id=$1", [result.jobId])).rows[0];
        expect(row).toMatchObject({ region: market, status: "queued", workspace_id: null, location_id: null, business_name: "Fixture shop" });
        expect(row.share_slug).toMatch(/^[A-Za-z0-9_-]{24}$/);
        expect(row.input_snapshot).toMatchObject({ version: 2, manualEntry: true });
    });
    it("selects public proof separately and binds viewer grants to the report", async () => {
        const job = (await runtime.query("INSERT INTO audit_jobs(business_name,share_slug,overall_score,score_coverage,raw_data,summary_en) VALUES('Private proof','fixture-report',72,0.5,'{\"secret\":true}','Private summary') RETURNING id")).rows[0];
        const store = createReportStore();
        const publicJob = await store.readPublicJobBySlug("fixture-report");
        expect(publicJob).toMatchObject({ overall_score: 72, score_coverage: 0.5 });
        expect(publicJob).not.toHaveProperty("raw_data");
        expect(publicJob).not.toHaveProperty("summary_en");
        expect(await store.readPublicJobBySlug("missing-report")).toBeNull();
        expect(await store.readAuthorizedJobData(job.id)).toMatchObject({ raw_data: { secret: true }, summary_en: "Private summary" });
        await expect(store.readAuthorizedJobData("00000000-0000-4000-8000-000000000001")).rejects.toThrow();
        expect(await store.findViewerGrant(job.id, "00000000-0000-4000-8000-000000000001")).toBeNull();
    });
    it.each(["place_id", "data_id", "data_cid"])("persists selected %s evidence with parent and trusted attribution", async (key) => {
        const ws = (await runtime.query("INSERT INTO workspaces(slug) VALUES($1) RETURNING id", [key])).rows[0].id;
        const loc = (await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'shop','Fixture') RETURNING id", [ws])).rows[0].id;
        const parent = (await runtime.query("INSERT INTO audit_jobs(business_name) VALUES('Parent') RETURNING id")).rows[0].id;
        const parsed = parseScanStartBody({ business_name: "Selected shop", market: "TW", locale: "zh-TW", industry: "fnb", district: "臺北市", objective: "more_leads", [key]: "identity", place_match_confidence: "high", provider: "serpapi", parent_job_id: parent, ig_handle: "fixture", ig_match_provenance: "picker_confirmed", alternate_names: ["Alternative"], maps_url: "https://maps.google.com/", facebook_url: "https://facebook.com/fixture" });
        expect(parsed.ok).toBe(true);
        if (!parsed.ok)
            throw Error(parsed.error);
        const result = await insertScanJob(parsed.input, { workspaceId: ws, locationId: loc });
        expect(result.ok).toBe(true);
        if (!result.ok)
            throw Error("insert failed");
        const row = (await runtime.query("SELECT * FROM audit_jobs WHERE id=$1", [result.jobId])).rows[0];
        expect(row).toMatchObject({ workspace_id: ws, location_id: loc, parent_job_id: parent, region: "tw", place_id: key === "place_id" ? "identity" : null, place_match_confidence: key === "place_id" ? "high" : null });
        expect(row.input_snapshot).toMatchObject({ version: 2, locale: "zh-TW", market: "TW", instagramMatchProvenance: "picker_confirmed", alternateNames: ["Alternative"], provider: "serpapi", manualEntry: false });
        const again = await insertScanJob(parsed.input);
        expect(again.ok).toBe(true);
        if (!again.ok)
            throw Error("insert failed");
        expect((await runtime.query("SELECT share_slug FROM audit_jobs WHERE id=$1", [again.jobId])).rows[0].share_slug).not.toBe(row.share_slug);
        expect(await jobsRepository.readStatus(result.jobId)).toMatchObject({ status: "queued", share_slug: row.share_slug, score_coverage: null });
    });
    it("enforces the atomic limit across concurrent requests", async () => {
        process.env.RATE_LIMIT_SECRET = "fixture-only-secret";
        const results = await Promise.all(Array.from({ length: 14 }, () => enforceRateLimit({ req: new Request("https://fixture.test"), scope: "scan_start", identifiers: ["concurrency-fixture"], failClosed: false })));
        expect(results.filter(r => r.allowed)).toHaveLength(10);
        expect(results.filter(r => !r.allowed)).toHaveLength(4);
        expect(results.every(r => !r.unavailable)).toBe(true);
    });
    it("unlocks through SQL, preserves locale/cookie and binds grant access to the job", async () => {
        process.env.RATE_LIMIT_SECRET = "fixture-only-secret";
        const job = (await runtime.query("INSERT INTO audit_jobs(business_name,share_slug,region,business_objective) VALUES('Unlock','unlock-fixture','tw','more_leads') RETURNING id")).rows[0].id;
        const body = { slug: "unlock-fixture", market: "hk", objective: "other", preferred_contact_channel: "line", contact_identifier: "fixture", locale: "zh-TW", report_delivery: true, idempotency_key: "A".repeat(43) };
        const request = () => new Request("https://fixture.test/api/report-access/unlock", { method: "POST", body: JSON.stringify(body) });
        const first = await unlock(request());
        expect(first.status).toBe(200);
        expect(await first.json()).toEqual({ ok: true, reportUrl: "/zh-TW/r/unlock-fixture" });
        expect(first.headers.get("set-cookie")).toContain("sme_report_grant=");
        expect((await unlock(request())).status).toBe(200);
        const grants = (await runtime.query("SELECT id,token_hash FROM report_access_grants WHERE job_id=$1", [job])).rows;
        expect(grants).toHaveLength(1);
        expect(grants[0].token_hash).toBe(createViewerTokenFromIdempotencyKey(body.idempotency_key).tokenHash);
        const store = createReportStore();
        expect(await store.findViewerGrant(job, grants[0].id)).toMatchObject({ job_id: job });
        expect(await store.findViewerGrant("00000000-0000-4000-8000-000000000001", grants[0].id)).toBeNull();
        await store.markViewerGrantUsed(job, grants[0].id);
        expect((await store.findViewerGrant(job, grants[0].id))?.last_used_at).not.toBeNull();
        await runtime.query("UPDATE report_access_grants SET revoked_at=now(),last_used_at=null WHERE id=$1", [grants[0].id]);
        await store.markViewerGrantUsed(job, grants[0].id);
        expect((await store.findViewerGrant(job, grants[0].id))?.last_used_at).toBeNull();
    });
    it("does not forward unlock analytics outside the integration fixture", async () => {
        const job = (await runtime.query("INSERT INTO audit_jobs(business_name,share_slug,region,business_objective) VALUES('Analytics isolation','analytics-isolation','tw','more_leads') RETURNING id")).rows[0].id;
        const body = { slug: "analytics-isolation", market: "tw", objective: "other", preferred_contact_channel: "line", contact_identifier: "fixture", locale: "zh-TW", report_delivery: true, idempotency_key: "B".repeat(43) };
        const originalFetch = globalThis.fetch;
        const fetchStub = vi.fn(async () => new Response(null, { status: 200 }));
        vi.stubEnv("POSTHOG_KEY", "fixture-only-posthog-key");
        globalThis.fetch = fetchStub as unknown as typeof fetch;
        try {
            const response = await unlock(new Request("https://fixture.test/api/report-access/unlock", { method: "POST", body: JSON.stringify(body) }));
            expect(response.status).toBe(200);
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(fetchStub).not.toHaveBeenCalled();
            expect((await runtime.query("SELECT id FROM audit_jobs WHERE id=$1", [job])).rows).toHaveLength(1);
        } finally {
            globalThis.fetch = originalFetch;
            vi.unstubAllEnvs();
        }
    });

 it("caps public findings while retaining private evidence, approved runs and summary caches",async()=>{
  const id=(await runtime.query("INSERT INTO audit_jobs(business_name) VALUES('Findings') RETURNING id")).rows[0].id;
  await runtime.query("INSERT INTO audit_findings(job_id,finding_key,module,severity,score_impact,owner_message_en,evidence) SELECT $1,'finding-'||n,'ig','high',-n,'private','{\"proof\":true}'::jsonb FROM generate_series(1,14)n",[id]);
  const store=createReportStore();const result=await store.readPublicFindings(id);expect(result.count).toBe(14);expect(result.findings).toHaveLength(12);expect(result.findings[0].score_impact).toBe(-14);expect(result.findings[0]).not.toHaveProperty("evidence");
  const privateRows=await store.readAuthorizedFindings(id);expect(privateRows).toHaveLength(14);expect(privateRows[0]).toMatchObject({owner_message_en:"private",evidence:{proof:true}});
  await runtime.query("INSERT INTO agent_runs(job_id,finding_key,agent_key,status,output) VALUES($1,'finding-1','review_reply_agent','draft','{}'),($1,'finding-2','review_reply_agent','approved','{\"draft\":\"approved\"}')",[id]);
  expect(await store.readApprovedAgentRuns(id)).toEqual([{findingKey:"finding-2",agentKey:"review_reply_agent",output:{draft:"approved"}}]);
  for(const column of ["summary_en","summary_zh","summary_tw"] as const)await store.cacheSummary(id,column,column);
  expect(await store.readAuthorizedJobData(id)).toMatchObject({summary_en:"summary_en",summary_zh:"summary_zh",summary_tw:"summary_tw"});
 });
});
