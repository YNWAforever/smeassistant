import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), list: vi.fn(), upload: vi.fn(), locationExists: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: mocks.auth }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: mocks.rate, rateLimitedResponse: () => new Response(null, { status: 429 }) }));
vi.mock("@/lib/workspace/conversation-documents", async importOriginal => ({ ...await importOriginal<object>(), listConversationDocuments: mocks.list, uploadConversationDocument: mocks.upload, conversationDocumentLocationExists: mocks.locationExists }));
import { GET, POST } from "./route";
import { ConversationDocumentError } from "@/lib/workspace/conversation-documents";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const context = { params: Promise.resolve({ workspaceId }) };
const membership = { workspaceId, workspaceSlug: "shop", userId: "owner", email: "o@example.com", role: "owner", locationScope: null };
const url = `https://app.test/api/workspaces/${workspaceId}/conversation/documents`;
const get = (query = "location_id=all") => GET(new Request(`${url}?${query}`), context);
function post(location = "all", extra: Record<string, string> = {}) {
  const form = new FormData(); form.set("file", new File(["menu"], "menu.txt", { type: "text/plain" })); form.set("location_id", location);
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return POST(new Request(url, { method: "POST", body: form }), context);
}
beforeEach(() => {
  vi.resetAllMocks(); vi.unstubAllEnvs(); vi.stubEnv("CONVERSATION_HOME_ENABLED", "true"); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("VERCEL_ENV", "preview");
  mocks.auth.mockResolvedValue({ ok: true, user: { id: "owner" }, membership });
  mocks.rate.mockResolvedValue({ allowed: true }); mocks.locationExists.mockResolvedValue(true); mocks.list.mockResolvedValue([]); mocks.upload.mockResolvedValue({ id: versionId });
});

describe("gated document endpoint", () => {
  it.each(["flag", "production"])("returns 404 before auth, multipart reads or storage with %s off", async kind => {
    if (kind === "flag") vi.stubEnv("CONVERSATION_HOME_ENABLED", "false"); else vi.stubEnv("VERCEL_ENV", "production");
    expect((await get()).status).toBe(404); expect((await post()).status).toBe(404);
    expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.list).not.toHaveBeenCalled();
  });
  it("requires an exact UUID/all scope and bounded valid citation IDs", async () => {
    for (const query of ["", "location_id=no", "location_id=all&location_id=all", "location_id=all&ids=no", `location_id=all&ids=${Array.from({ length: 51 }, () => versionId).join(",")}`]) expect((await get(query)).status).toBe(400);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("passes exact location and explicit IDs with private cache headers", async () => {
    const response = await get(`location_id=${locationId}&ids=${versionId}`);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ versions: [] });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.auth).toHaveBeenCalledWith({ id: workspaceId }, { locationId });
    expect(mocks.list).toHaveBeenCalledWith({ workspaceId, locationId }, [versionId]);
  });
  it("does not widen all into any location", async () => {
    await get(); expect(mocks.list).toHaveBeenCalledWith({ workspaceId, locationId: null }, undefined);
  });
  it("rejects a scoped manager's forbidden location even when an auth dependency returns it", async () => {
    mocks.auth.mockResolvedValue({ ok: true, user: { id: "manager" }, membership: { ...membership, role: "manager", locationScope: [] } });
    expect((await get(`location_id=${locationId}`)).status).toBe(403); expect(mocks.list).not.toHaveBeenCalled();
  });
  it("rejects foreign/nonexistent workspace locations before loading text or uploading", async () => {
    mocks.locationExists.mockResolvedValue(false);
    expect((await get(`location_id=${locationId}`)).status).toBe(400); expect((await post(locationId)).status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
  });
  it.each(["manager", "viewer"])("rejects %s uploads with an owner role guard", async role => {
    mocks.auth.mockResolvedValue({ ok: true, user: { id: "member" }, membership: { ...membership, role } });
    expect((await post()).status).toBe(403); expect(mocks.auth).toHaveBeenCalledWith({ id: workspaceId }, { minRole: "owner" }); expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("preserves unauthenticated and dependency unavailable states safely", async () => {
    mocks.auth.mockResolvedValueOnce({ ok: false, status: 401, code: "unauthenticated" }); expect((await get()).status).toBe(401);
    mocks.auth.mockRejectedValueOnce(new Error("membership_dependency_unavailable")); expect((await get()).status).toBe(503);
    mocks.list.mockRejectedValueOnce(new Error("secret database address")); const result = await get(); expect(result.status).toBe(503); expect(await result.json()).toEqual({ error: "unavailable" });
  });
  it("uploads an owner version into the explicit scope and bounds upload rates", async () => {
    const response = await post(locationId, { document_id: versionId });
    expect(response.status).toBe(201); expect(await response.json()).toEqual({ version: { id: versionId } });
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ workspaceId, locationId, documentId: versionId, uploadedBy: "owner", file: expect.any(Blob) }));
    mocks.rate.mockResolvedValueOnce({ allowed: false }); expect((await post()).status).toBe(429);
  });
  it("maps unsupported, malformed and unavailable-version errors without leaking details", async () => {
    mocks.upload.mockRejectedValueOnce(new ConversationDocumentError("unsupported_type")); expect((await post()).status).toBe(415);
    mocks.upload.mockRejectedValueOnce(new ConversationDocumentError("file_too_large")); expect((await post()).status).toBe(413);
    mocks.list.mockRejectedValueOnce(new ConversationDocumentError("document_not_found")); expect((await get(`location_id=all&ids=${versionId}`)).status).toBe(404);
    mocks.upload.mockRejectedValueOnce(new Error("blob token")); const result = await post(); expect(await result.json()).toEqual({ error: "unavailable" });
  });
});
