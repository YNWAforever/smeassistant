import { describe, expect, it, vi, beforeEach } from "vitest";

const ports = vi.hoisted(() => ({
  auth: null as unknown,
  repo: {
    approvedVersion: vi.fn(),
    assertApplied: vi.fn(),
    retract: vi.fn(),
    latestOwnerAssertion: vi.fn(),
  },
}));

vi.mock("@/app/api/actions/_shared/mutation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/api/actions/_shared/mutation")>()),
  authorizeActionMutation: async () => ports.auth,
}));
vi.mock("@/lib/repositories/applications", () => ({ applicationRepository: () => ports.repo }));
vi.mock("@/lib/workspace/audit", () => ({ recordNeonEvent: vi.fn(), ipHashFor: () => null }));

const { POST, DELETE } = await import("./route");

const OK_AUTH = {
  ok: true,
  user: { id: "11111111-1111-4111-8111-111111111111" },
  membership: {},
  scope: { actionId: "22222222-2222-4222-8222-222222222222", workspaceId: "33333333-3333-4333-8333-333333333333", locationId: null },
  ipHash: null,
};
const params = { params: Promise.resolve({ actionId: "22222222-2222-4222-8222-222222222222" }) };
const req = (body: unknown) => new Request("http://x/applied", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  ports.auth = OK_AUTH;
  ports.repo.approvedVersion.mockResolvedValue(true);
  ports.repo.assertApplied.mockResolvedValue({ id: "app-1" });
  ports.repo.retract.mockResolvedValue({ id: "app-1" });
  ports.repo.latestOwnerAssertion.mockResolvedValue(null);
  vi.clearAllMocks();
});

describe("POST /api/actions/[actionId]/applied", () => {
  it("refuses an unauthorized caller with the shared helper's own response", async () => {
    ports.auth = { ok: false, response: new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }) };
    expect((await POST(req({}), params)).status).toBe(403);
  });

  it("records an assertion with no version", async () => {
    const res = await POST(req({}), params);
    expect(res.status).toBe(201);
    expect(ports.repo.assertApplied).toHaveBeenCalled();
  });

  it("rejects a version that is not approved or not this action's", async () => {
    ports.repo.approvedVersion.mockResolvedValue(false);
    const res = await POST(req({ output_version_id: "44444444-4444-4444-8444-444444444444" }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "version_not_applicable" });
    expect(ports.repo.assertApplied).not.toHaveBeenCalled();
  });

  it("rejects a malformed version id without touching the database", async () => {
    const res = await POST(req({ output_version_id: "nope" }), params);
    expect(res.status).toBe(400);
    expect(ports.repo.approvedVersion).not.toHaveBeenCalled();
  });

  it("is idempotent: an existing assertion for the same version returns 200, not a second row", async () => {
    ports.repo.latestOwnerAssertion.mockResolvedValue({ id: "app-1", output_version_id: null });
    const res = await POST(req({}), params);
    expect(res.status).toBe(200);
    expect(ports.repo.assertApplied).not.toHaveBeenCalled();
  });

  it("returns 409 when the action is closed", async () => {
    ports.repo.assertApplied.mockResolvedValue(null);
    expect((await POST(req({}), params)).status).toBe(409);
  });
});

describe("DELETE /api/actions/[actionId]/applied", () => {
  it("retracts the newest assertion", async () => {
    const res = await DELETE(new Request("http://x/applied", { method: "DELETE" }), params);
    expect(res.status).toBe(200);
    expect(ports.repo.retract).toHaveBeenCalled();
  });

  it("returns 404 when there is nothing to retract", async () => {
    ports.repo.retract.mockResolvedValue(null);
    expect((await DELETE(new Request("http://x/applied", { method: "DELETE" }), params)).status).toBe(404);
  });
});
