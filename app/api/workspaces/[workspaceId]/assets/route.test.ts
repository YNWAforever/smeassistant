import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  enforceRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 1 })),
  insertAsset: vi.fn(),
  listAssets: vi.fn(),
  signedUrlFor: vi.fn(async () => "https://signed/url"),
  recordEvent: vi.fn(async () => undefined),
  loadWorkspaceContext: vi.fn(async () => ({ locations: [{ id: "11111111-1111-4111-8111-111111111111", name: "Yik Yam Street" }] })),
}));

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: mocks.authorizeWorkspaceRequest }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => ({}) }));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/security/rate-limit")>();
  return { ...original, enforceRateLimit: mocks.enforceRateLimit };
});
vi.mock("@/lib/workspace/assets", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/workspace/assets")>();
  return { ...original, insertAsset: mocks.insertAsset, listAssets: mocks.listAssets, signedUrlFor: mocks.signedUrlFor };
});
vi.mock("@/lib/workspace/audit", () => ({ recordEvent: mocks.recordEvent, ipHashFor: () => "hash" }));
vi.mock("@/lib/workspace/queries", () => ({ loadWorkspaceContext: mocks.loadWorkspaceContext }));

import { GET, POST } from "./route";

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const LOCATION = "11111111-1111-4111-8111-111111111111";
const USER = { id: "user-1", email: "owner@example.com", verified: true };
const MEMBER = { workspaceId: WORKSPACE, workspaceSlug: "kam-man-house", userId: USER.id, email: USER.email, role: "owner", locationScope: null };

function multipart(fields: Record<string, string | Blob>, file?: { bytes: number; type: string; name?: string }): Request {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  if (file) form.set("file", new File([new Uint8Array(file.bytes)], file.name ?? "lunch.jpg", { type: file.type }));
  return new Request(`https://app.test/api/workspaces/${WORKSPACE}/assets`, { method: "POST", body: form });
}

const params = { params: Promise.resolve({ workspaceId: WORKSPACE }) };

describe("POST /api/workspaces/[workspaceId]/assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: true, user: USER, membership: MEMBER });
    mocks.insertAsset.mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333", storage_path: `${WORKSPACE}/33333333-3333-4333-8333-333333333333/lunch.jpg`, filename: "lunch.jpg" });
  });

  it("validates the multipart body before touching auth or storage", async () => {
    expect((await POST(multipart({ kind: "image" }), params)).status).toBe(400);
    expect((await POST(multipart({ kind: "poster" }, { bytes: 10, type: "image/jpeg" }), params)).status).toBe(400);
    expect((await POST(multipart({ kind: "image" }, { bytes: 10, type: "image/svg+xml" }), params)).status).toBe(415);
    expect((await POST(multipart({ kind: "image" }, { bytes: 5 * 1024 * 1024 + 1, type: "image/png" }), params)).status).toBe(413);
    expect((await POST(multipart({ kind: "image", location_id: "not-a-uuid" }, { bytes: 10, type: "image/png" }), params)).status).toBe(400);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(mocks.insertAsset).not.toHaveBeenCalled();
  });

  it("401s without a session and 403s a viewer or out-of-scope manager, with the location passed to the scope check", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValueOnce({ ok: false, status: 401, code: "unauthenticated" });
    expect((await POST(multipart({ kind: "image" }, { bytes: 10, type: "image/jpeg" }), params)).status).toBe(401);
    mocks.authorizeWorkspaceRequest.mockResolvedValueOnce({ ok: false, status: 403, code: "forbidden" });
    const res = await POST(multipart({ kind: "image", location_id: LOCATION }, { bytes: 10, type: "image/jpeg" }), params);
    expect(res.status).toBe(403);
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenLastCalledWith({ id: WORKSPACE }, { minRole: "manager", locationId: LOCATION });
    expect(mocks.insertAsset).not.toHaveBeenCalled();
    expect(mocks.recordEvent).not.toHaveBeenCalled();
  });

  it("429s when the asset_upload budget is spent", async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 120 });
    const res = await POST(multipart({ kind: "image" }, { bytes: 10, type: "image/jpeg" }), params);
    expect(res.status).toBe(429);
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ scope: "asset_upload", identifiers: [USER.id], failClosed: true }));
    expect(mocks.insertAsset).not.toHaveBeenCalled();
  });

  it("stores the file, records asset.uploaded and returns the id with a signed URL", async () => {
    const res = await POST(multipart({ kind: "image", location_id: LOCATION, alt_text: "  Lunch set  ", locale: "zh-HK" }, { bytes: 10, type: "image/jpeg", name: "lunch.jpg" }), params);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ assetId: "33333333-3333-4333-8333-333333333333", signedUrl: "https://signed/url" });
    expect(mocks.insertAsset).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ workspaceId: WORKSPACE, locationId: LOCATION, kind: "image", filename: "lunch.jpg", contentType: "image/jpeg", altText: "Lunch set", uploadedBy: USER.id }));
    expect(mocks.recordEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event: "asset.uploaded", entityType: "asset", entityId: "33333333-3333-4333-8333-333333333333", actorId: USER.id, locale: "zh-HK", payload: expect.objectContaining({ kind: "image", bytes: 10 }) }));
  });

  it("rejects a location that is not in the workspace", async () => {
    const res = await POST(multipart({ kind: "image", location_id: "44444444-4444-4444-8444-444444444444" }, { bytes: 10, type: "image/jpeg" }), params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_location" });
    expect(mocks.insertAsset).not.toHaveBeenCalled();
  });

  it("503s when storage fails, without an audit row", async () => {
    mocks.insertAsset.mockRejectedValueOnce(new Error("asset_storage_upload_failed"));
    const res = await POST(multipart({ kind: "menu" }, { bytes: 10, type: "application/pdf", name: "menu.pdf" }), params);
    expect(res.status).toBe(503);
    expect(mocks.recordEvent).not.toHaveBeenCalled();
  });
});

describe("GET /api/workspaces/[workspaceId]/assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: true, user: USER, membership: { ...MEMBER, role: "viewer" } });
    mocks.listAssets.mockResolvedValue([{ id: "a1", signedUrl: "https://signed/a1" }]);
  });

  it("lists assets for any accepted member with signed URLs", async () => {
    const res = await GET(new Request(`https://app.test/api/workspaces/${WORKSPACE}/assets`), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ assets: [{ id: "a1", signedUrl: "https://signed/a1" }] });
    expect(mocks.listAssets).toHaveBeenCalledWith(expect.anything(), WORKSPACE, expect.any(Array));
  });

  it("401s without a session", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValueOnce({ ok: false, status: 401, code: "unauthenticated" });
    expect((await GET(new Request(`https://app.test/api/workspaces/${WORKSPACE}/assets`), params)).status).toBe(401);
  });
});
