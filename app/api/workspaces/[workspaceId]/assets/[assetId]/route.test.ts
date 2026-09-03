import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  getAsset: vi.fn(),
  updateAssetRights: vi.fn(),
  recordEvent: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: mocks.authorizeWorkspaceRequest }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => ({}) }));
vi.mock("@/lib/workspace/assets", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/workspace/assets")>();
  return { ...original, getAsset: mocks.getAsset, updateAssetRights: mocks.updateAssetRights };
});
vi.mock("@/lib/workspace/audit", () => ({ recordEvent: mocks.recordEvent, ipHashFor: () => "hash" }));

import { PATCH } from "./route";

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const ASSET = "33333333-3333-4333-8333-333333333333";
const LOCATION = "11111111-1111-4111-8111-111111111111";
const USER = { id: "user-1", email: "owner@example.com", verified: true };
const MEMBER = { workspaceId: WORKSPACE, workspaceSlug: "kam-man-house", userId: USER.id, email: USER.email, role: "manager", locationScope: [LOCATION] };
const ROW = { id: ASSET, workspace_id: WORKSPACE, location_id: LOCATION, kind: "image", storage_path: `${WORKSPACE}/${ASSET}/lunch.jpg`, filename: "lunch.jpg", alt_text: null, rights_status: "needs_review", rights_confirmed_at: null, uploaded_by: USER.id, created_at: "2026-09-03T00:00:00Z" };

function patch(body: unknown, assetId = ASSET): Promise<Response> {
  return PATCH(
    new Request(`https://app.test/api/workspaces/${WORKSPACE}/assets/${assetId}`, { method: "PATCH", body: typeof body === "string" ? body : JSON.stringify(body) }),
    { params: Promise.resolve({ workspaceId: WORKSPACE, assetId }) },
  );
}

describe("PATCH /api/workspaces/[workspaceId]/assets/[assetId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: true, user: USER, membership: MEMBER });
    mocks.getAsset.mockResolvedValue(ROW);
    mocks.updateAssetRights.mockResolvedValue({ ...ROW, rights_status: "approved", rights_confirmed_at: "2026-09-03T10:00:00Z" });
  });

  it("400s invalid JSON and bodies, 404s malformed ids, before auth", async () => {
    expect((await patch("{nope")).status).toBe(400);
    expect((await patch({ rights_status: "needs_review" })).status).toBe(400);
    expect((await patch({ rights_status: "approved" }, "not-a-uuid")).status).toBe(404);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("401s without a session and 403s a viewer", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValueOnce({ ok: false, status: 401, code: "unauthenticated" });
    expect((await patch({ rights_status: "approved" })).status).toBe(401);
    mocks.authorizeWorkspaceRequest.mockResolvedValueOnce({ ok: false, status: 403, code: "forbidden" });
    expect((await patch({ rights_status: "approved" })).status).toBe(403);
    expect(mocks.updateAssetRights).not.toHaveBeenCalled();
  });

  it("checks the asset's own location against the manager's scope", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValueOnce({ ok: true, user: USER, membership: MEMBER }).mockResolvedValueOnce({ ok: false, status: 403, code: "forbidden" });
    expect((await patch({ rights_status: "approved" })).status).toBe(403);
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenLastCalledWith({ id: WORKSPACE }, { minRole: "manager", locationId: LOCATION });
    expect(mocks.updateAssetRights).not.toHaveBeenCalled();
  });

  it("404s an asset from another workspace", async () => {
    mocks.getAsset.mockResolvedValueOnce(null);
    expect((await patch({ rights_status: "approved" })).status).toBe(404);
    expect(mocks.recordEvent).not.toHaveBeenCalled();
  });

  it("sets rights_confirmed_at and records asset.rights_confirmed", async () => {
    const res = await patch({ rights_status: "approved", alt_text: "Lunch set", locale: "en" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, rights_status: "approved", rights_confirmed_at: "2026-09-03T10:00:00Z" });
    expect(mocks.updateAssetRights).toHaveBeenCalledWith(expect.anything(), { workspaceId: WORKSPACE, assetId: ASSET, rightsStatus: "approved", altText: "Lunch set" });
    expect(mocks.recordEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event: "asset.rights_confirmed", entityType: "asset", entityId: ASSET, locationId: LOCATION, actorId: USER.id, locale: "en", payload: { rights_status: "approved", filename: "lunch.jpg" } }));
  });

  it("leaves alt_text untouched when it is omitted", async () => {
    await patch({ rights_status: "rejected" });
    expect(mocks.updateAssetRights).toHaveBeenCalledWith(expect.anything(), { workspaceId: WORKSPACE, assetId: ASSET, rightsStatus: "rejected" });
  });
});
