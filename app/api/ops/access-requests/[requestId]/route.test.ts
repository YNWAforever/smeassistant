import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveOperator: vi.fn(),
  get: vi.fn(),
  resolveAccessRequest: vi.fn(),
  assistedAssignmentEnabled: vi.fn(),
}));

vi.mock("@/lib/auth/operator", () => ({ resolveOperator: () => mocks.resolveOperator() }));
vi.mock("@/lib/repositories/access-requests", () => ({
  accessRequestRepository: () => ({ get: mocks.get }),
  resolveAccessRequest: (...a: unknown[]) => mocks.resolveAccessRequest(...a),
}));
vi.mock("@/lib/workspace/assignment-flag", () => ({
  assistedAssignmentEnabled: () => mocks.assistedAssignmentEnabled(),
}));

const { resolveOperator, get, resolveAccessRequest, assistedAssignmentEnabled } = mocks;

const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const BODY = {
  decision: "approved",
  reason: "Registration checked",
  verification: { method: "BR12345678", verified_by: "Ada Wong" },
};

function patch(body: unknown = BODY, requestId = REQUEST_ID) {
  return import("./route").then(({ PATCH }) =>
    PATCH(
      new Request(`https://app.test/api/ops/access-requests/${requestId}`, { method: "PATCH", body: JSON.stringify(body) }),
      { params: Promise.resolve({ requestId }) },
    ),
  );
}

function ready() {
  assistedAssignmentEnabled.mockReturnValue(true);
  resolveOperator.mockResolvedValue({ userId: "op-1", email: "ada.wong@fimmick.com" });
  get.mockResolvedValue({
    request: {
      id: REQUEST_ID, job_id: "job-1", user_id: "u-1", requester_email: "o@example.test",
      business_name: "Kam Man House", industry: null, district: null, region: "hk",
      resolved_at: null, place_id: null, share_slug: "abc", job_workspace_id: null,
      requested_at: "2026-09-10T02:00:00Z", resolved_by_staff_user_id: null,
    },
    events: [],
  });
  resolveAccessRequest.mockResolvedValue({ ok: true, workspaceId: "ws-1", slug: "kam-man-house" });
}

afterEach(() => vi.resetAllMocks());

describe("PATCH /api/ops/access-requests/[requestId]", () => {
  it("approves and reports the created workspace", async () => {
    ready();
    const response = await patch();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, workspaceId: "ws-1", slug: "kam-man-house" });
  });

  // DEC-06: with the flag off there is no decision route, for anyone.
  it("answers 404 with the flag off, before authorizing", async () => {
    assistedAssignmentEnabled.mockReturnValue(false);
    resolveOperator.mockResolvedValue({ userId: "op-1", email: "ada.wong@fimmick.com" });
    expect((await patch()).status).toBe(404);
    expect(resolveOperator).not.toHaveBeenCalled();
    expect(resolveAccessRequest).not.toHaveBeenCalled();
  });

  it("refuses a non-operator with the flag on", async () => {
    ready();
    resolveOperator.mockResolvedValue(null);
    expect((await patch()).status).toBe(403);
    expect(resolveAccessRequest).not.toHaveBeenCalled();
  });

  it("answers 409 for a request someone already decided", async () => {
    ready();
    get.mockResolvedValue({ request: { id: REQUEST_ID, resolved_at: "2026-09-11T00:00:00Z" }, events: [] });
    expect((await patch()).status).toBe(409);
    expect(resolveAccessRequest).not.toHaveBeenCalled();
  });

  // The loser of a race must see a refusal, never a silent success.
  it("answers 409 when a concurrent decision won the idempotency key", async () => {
    ready();
    resolveAccessRequest.mockRejectedValue(Object.assign(new Error("duplicate"), { code: "23505" }));
    const response = await patch();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "already_decided" });
  });

  it("answers 409 when the job was claimed while the request waited", async () => {
    ready();
    resolveAccessRequest.mockRejectedValue(new Error("already_claimed"));
    const response = await patch();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "already_claimed" });
  });

  it.each([
    ["an unknown decision", { ...BODY, decision: "maybe" }],
    ["no reason", { ...BODY, reason: "  " }],
    ["no verification on a terminal decision", { decision: "approved", reason: "ok" }],
    ["blank verifier", { ...BODY, verification: { method: "BR1", verified_by: "" } }],
  ])("rejects %s", async (_label, body) => {
    ready();
    expect((await patch(body)).status).toBe(400);
    expect(resolveAccessRequest).not.toHaveBeenCalled();
  });

  it("does not require verification to ask for more information", async () => {
    ready();
    resolveAccessRequest.mockResolvedValue({ ok: true, workspaceId: null, slug: null });
    const response = await patch({ decision: "needs_information", reason: "Please send the BR number" });
    expect(response.status).toBe(200);
  });
});
