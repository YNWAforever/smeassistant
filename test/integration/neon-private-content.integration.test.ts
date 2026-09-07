import { Pool } from "pg";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { assetRepository } from "../../lib/repositories/assets";

import { putBrand } from "../../lib/workspace/brand";
import { brandRepository } from "../../lib/repositories/brand";
import { evidenceRepository } from "../../lib/repositories/evidence";
import { resolveApplicationUser } from "../../lib/identity/users";
import { membershipRepository } from "../../lib/repositories/membership";
import { authorizeReport } from "../../lib/report-access/authorize-report";
import { createReportLoader } from "../../lib/report/load-report";
import { reportsRepository } from "../../lib/repositories/reports";
import { loadAuthorizedEvidence } from "../../lib/evidence/load-authorized";
import { persistEvidenceSnapshots } from "../../lib/evidence/persist";
const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined, sign: vi.fn(async (_ns: string, path: string) => `https://fixture.private.blob.vercel-storage.com/${path}?fixture=1`) }));
vi.mock("../../lib/db/client", () => ({ getPool: () => ports.pool }));
vi.mock("../../lib/storage/private-blob", () => ({ createPrivateBlobStorage: () => ({ sign: ports.sign, upload: () => { throw new Error("fixture forbids storage transport"); } }) }));
vi.mock("../../lib/evidence/safe-media", () => ({ downloadEvidenceMedia: () => { throw new Error("fixture forbids media transport"); } }));

describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon private content metadata", () => {
  let fixture: NeonDatabaseFixture; let owner: Pool; let runtime: Pool;
  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test"); owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl); url.username = "fixture_runtime"; url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href }); ports.pool = runtime;
  });
  beforeEach(async () => { await runtime.query("DELETE FROM audit_jobs; DELETE FROM workspaces; DELETE FROM app_users"); });
  afterAll(async () => { await Promise.all([owner?.end(), runtime?.end()]); fixture?.stop(); });
  async function workspace(slug: string) { return (await runtime.query("INSERT INTO workspaces(slug,market) VALUES($1,'tw') RETURNING id", [slug])).rows[0].id as string; }
  it("persists scoped asset metadata and explicit rights; missing differs from SQL error", async () => {
    const ws = await workspace("one"), other = await workspace("other");
    const repo = assetRepository(runtime);
    expect(await repo.list(ws)).toEqual([]);
    const user = await resolveApplicationUser({ provider: "neon", subject: "asset-owner", email: "owner@example.test", verified: true });
    const id = crypto.randomUUID();
    await repo.insert({ id, workspace_id: ws, location_id: null, kind: "image", storage_path: `${ws}/${id}/a.png`, filename: "a.png", alt_text: null, rights_status: "needs_review", rights_confirmed_at: null, uploaded_by: user.id });
    expect(await repo.get(other, id)).toBeNull();
    expect(await repo.updateRights({ workspaceId: other, assetId: id, rightsStatus: "approved" }, "2026-09-06T00:00:00Z")).toBeNull();
    expect(await repo.get(ws, id)).toMatchObject({ rights_status: "needs_review", rights_confirmed_at: null });
    expect(await repo.updateRights({ workspaceId: ws, assetId: id, rightsStatus: "approved", altText: "台北" }, "2026-09-06T00:00:00Z")).toMatchObject({ rights_status: "approved", alt_text: "台北" });
    const closed = new Pool({ connectionString: fixture.databaseUrl }); await closed.end();
    await expect(assetRepository(closed).list(ws)).rejects.toThrow();
  });
  it("upserts TW brand language and facts without conflating missing/error", async () => {
    const ws = await workspace("brand"), other = await workspace("other");
    const repo = brandRepository(runtime);
    expect(await repo.get(ws)).toBeNull();
    const row = { workspace_id: ws, voice: "warm", approved_claims: ["台北"], prohibited_terms: [], languages: ["zh-TW"], facts: { currency: "TWD" }, updated_at: "2026-09-06T00:00:00Z" };
    await repo.put(row); await repo.put({ ...row, voice: "direct", languages: ["en","zh-TW"] });
    expect(await repo.get(ws)).toMatchObject({ voice: "direct", languages: ["en","zh-TW"], facts: { currency: "TWD" } });
    expect(await repo.get(other)).toBeNull();
    const user = await resolveApplicationUser({ provider: "neon", subject: "brand-owner", email: "brand@example.test", verified: true });
    await putBrand({ workspaceId: ws, actorId: user.id, brand: { voice: "direct", approved_claims: ["台北"], prohibited_terms: [], languages: ["zh-TW"], facts: { currency: "TWD" } }, locale: "zh-TW" });
    expect((await runtime.query("SELECT event,payload FROM audit_events WHERE workspace_id=$1", [ws])).rows).toEqual([{ event: "brand.updated", payload: { locale: "zh-TW", voice: "direct", languages: ["zh-TW"], approved_claims: 1, prohibited_terms: 0, facts: 1 } }]);
    expect((await runtime.query("SELECT count(*)::int AS count FROM brand_profiles WHERE workspace_id=$1", [ws])).rows[0].count).toBe(1);
  });
  it("stores metadata-only evidence with the production repository and no provider transport", async () => {
    const ws = await workspace("evidence");
    const job = (await runtime.query("INSERT INTO audit_jobs(business_name,workspace_id) VALUES('Fixture',$1) RETURNING id", [ws])).rows[0].id;
    await persistEvidenceSnapshots(job, [{ provider: "instagram", evidenceType: "post", sourceId: "p1", sourceUrl: "https://example.test/post", mediaUrl: null, capturedAt: "2026-09-06T00:00:00Z", publishedAt: null, text: "台北", metadata: {}, retention: "metadata_only" }]);
    const repo = evidenceRepository(runtime);
    expect(await repo.list(job)).toMatchObject([{ text_content: "台北", storage_path: null, collection_status: "metadata_only" }]);
    await repo.delete(job); expect(await repo.list(job)).toEqual([]);
  });
  it("accepted viewers and out-of-scope managers retain evidence reads; foreign/revoked members do not", async () => {
    const ws = await workspace("evidence-read"), other = await workspace("foreign");
    const user = await resolveApplicationUser({ provider: "neon", subject: "reader", email: "reader@example.test", verified: true });
    const job = (await runtime.query("INSERT INTO audit_jobs(business_name,workspace_id) VALUES('Fixture',$1) RETURNING id", [ws])).rows[0].id;
    const path = `${job}/instagram/post/${"a".repeat(64)}.jpg`;
    await evidenceRepository(runtime).upsert({ job_id: job, provider: "instagram", evidence_type: "post", source_id: "p1", source_url: "https://example.test/post", captured_at: "2026-09-06T00:00:00Z", metadata: {}, storage_bucket: "report-evidence", storage_path: path, collection_status: "stored", content_sha256: "a".repeat(64), mime_type: "image/jpeg", byte_size: 3, width: 1, height: 1 });
    await runtime.query("INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,$3,'viewer',now())", [ws,user.id,user.email]);
    async function access(workspaceId: string) {
      const member = await membershipRepository.accepted(user.id, workspaceId);
      return authorizeReport({ job: { id: job, workspace_id: ws }, viewerToken: null, staffUser: null, workspaceMembership: member ? { workspaceId: member.workspace_id, role: member.role } : null });
    }
    expect(await access(ws)).toMatchObject({ kind: "member", role: "viewer" });
    expect((await loadAuthorizedEvidence(job)).items[0]).toMatchObject({ status: "stored", mediaUrl: expect.stringContaining("fixture.private") });
    expect(ports.sign).toHaveBeenCalledWith("report-evidence", path, 300);
    await runtime.query("UPDATE workspace_members SET role='manager',location_scope=ARRAY[gen_random_uuid()] WHERE workspace_id=$1", [ws]);
    expect(await access(ws)).toMatchObject({ kind: "member", role: "manager" });
    await runtime.query("UPDATE audit_jobs SET share_slug='private-fixture' WHERE id=$1",[job]);
    const loadEvidence = vi.fn(loadAuthorizedEvidence);
    let membershipWorkspace = ws;
    const loader = createReportLoader({
      store: reportsRepository(runtime), languageService: {resolveSummary: async () => "fixture only"},
      loadEvidence, getViewerToken: async () => null, getStaffUser: async () => null,
      getMembership: async () => {
        const member=await membershipRepository.accepted(user.id,membershipWorkspace);
        return member ? {workspaceId:member.workspace_id,role:member.role} : null;
      },
      scheduleAfter: () => { throw new Error("fixture forbids background work"); },
    });
    ports.sign.mockClear();
    expect((await loader('private-fixture','zh-TW')).access).toBe('member');
    expect(loadEvidence).toHaveBeenCalledWith(job);
    expect(ports.sign).toHaveBeenCalledWith("report-evidence",path,300);
    await runtime.query("INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,$3,'owner',now())",[other,user.id,user.email]);
    expect(await access(other)).toMatchObject({ kind: "public" });
    membershipWorkspace=other; loadEvidence.mockClear(); ports.sign.mockClear();
    expect((await loader('private-fixture','zh-TW')).access).toBe('public');
    expect(loadEvidence).not.toHaveBeenCalled(); expect(ports.sign).not.toHaveBeenCalled();
    await runtime.query("DELETE FROM workspace_members WHERE workspace_id=$1", [ws]);
    expect(await access(ws)).toMatchObject({ kind: "public" });
    membershipWorkspace=ws;
    expect((await loader('private-fixture','zh-TW')).access).toBe('public');
    expect(loadEvidence).not.toHaveBeenCalled(); expect(ports.sign).not.toHaveBeenCalled();
  });

  it("rejects asset locations from another workspace before metadata insertion", async () => {
    const ws = await workspace("asset-one"), other = await workspace("asset-other");
    const location = (await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'main','Main') RETURNING id", [other])).rows[0].id;
    const id = crypto.randomUUID();
    await expect(assetRepository(runtime).insert({ id, workspace_id: ws, location_id: location, kind: "image", storage_path: `${ws}/${id}/a.png`, filename: "a.png", alt_text: null, rights_status: "needs_review", rights_confirmed_at: null, uploaded_by: null })).rejects.toThrow("asset_location_invalid");
    expect(await assetRepository(runtime).list(ws)).toEqual([]);
  });
  it("keeps missing evidence empty and SQL outages as errors", async () => {
    const id = crypto.randomUUID(); expect(await evidenceRepository(runtime).list(id)).toEqual([]);
    const closed = new Pool({ connectionString: fixture.databaseUrl }); await closed.end();
    await expect(evidenceRepository(closed).list(id)).rejects.toThrow();
    await expect(brandRepository(closed).get(id)).rejects.toThrow();
  });

});
