import { beforeEach, describe, expect, it, vi } from "vitest";
const ports = vi.hoisted(() => ({ auth: null as unknown, record: vi.fn() }));
vi.mock("@/app/api/actions/_shared/mutation", async importOriginal => ({
  ...(await importOriginal<typeof import("@/app/api/actions/_shared/mutation")>()),
  authorizeActionMutation: async () => ports.auth,
}));
vi.mock("@/lib/repositories/owner-review-check", () => ({ ownerReviewCheckRepository: () => ({ record: ports.record }) }));
const { POST } = await import("./route");
const id = (n: number) => `${n}`.repeat(8) + "-1111-4111-8111-111111111111";
const auth = { ok: true, user: { id: id(1) }, scope: { workspaceId: id(2), actionId: id(3), locationId: null }, ipHash: null };
const body = () => ({ versionId: id(4), latestVersionId: id(4), expectedRecordId: null, requestId: id(5),
  decision: "checked", reviewReference: "Reviewer · date · review excerpt", note: "", evidenceAssetId: null,
  confirmBusiness: true, confirmReview: true, confirmReply: true });
const params = { params: Promise.resolve({ actionId: id(3) }) };
const request = (value: unknown) => new Request("http://localhost/owner-check", { method: "POST", body: JSON.stringify(value) });
beforeEach(() => {
  ports.auth = auth;
  ports.record.mockReset().mockResolvedValue({ ok: true, record: { id: "6", independent: false }, duplicate: false });
});
describe("owner check endpoint without DB/provider access", () => {
  it.each([401, 403, 404, 429, 503])("preserves shared authorization/limiter refusal %s before touching persistence", async status => {
    ports.auth = { ok: false, response: new Response("{}", { status }) };
    expect((await POST(request(body()), params)).status).toBe(status);
    expect(ports.record).not.toHaveBeenCalled();
  });
  it("takes workspace/action/actor from authorization, never a caller-supplied scope", async () => {
    const response = await POST(request(body()), params);
    expect(response.status).toBe(201);
    expect(ports.record).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: id(2), actionId: id(3), actorId: id(1), locationId: null,
    }));
    expect((await POST(request({ ...body(), workspaceId: id(7) }), params)).status).toBe(400);
    expect((await POST(request({ ...body(), verified: true }), params)).status).toBe(400);
  });
  it("returns the original saved record for a duplicate rather than another operation", async () => {
    ports.record.mockResolvedValue({ ok: true, record: { id: "6", independent: false }, duplicate: true });
    const response = await POST(request(body()), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ duplicate: true, record: { id: "6", independent: false } });
  });
  it.each(["stale_version", "stale_check", "not_applied", "invalid_evidence"])("exposes an actionable conflict for %s", async error => {
    ports.record.mockResolvedValue({ ok: false, error });
    expect((await POST(request(body()), params)).status).toBe(409);
  });
  it("returns a retryable save failure without reporting saved", async () => {
    ports.record.mockRejectedValue(new Error("synthetic DB unavailable"));
    const response = await POST(request(body()), params);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });
});
