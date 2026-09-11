import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  jobBySlug: vi.fn(),
  isLeadRecipient: vi.fn(),
  recordAccessRequest: vi.fn(),
  openRequestFor: vi.fn(),
  recordNeonEvent: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getUser: () => mocks.getUser() }));
vi.mock("@/lib/repositories/claims", () => ({
  claimsRepository: {
    jobBySlug: mocks.jobBySlug,
    isLeadRecipient: mocks.isLeadRecipient,
    recordAccessRequest: mocks.recordAccessRequest,
  },
}));
vi.mock("@/lib/repositories/access-requests", () => ({
  accessRequestRepository: () => ({ openRequestFor: mocks.openRequestFor }),
}));
vi.mock("@/lib/workspace/audit", () => ({
  recordNeonEvent: (...a: unknown[]) => mocks.recordNeonEvent(...a),
  ipHashFor: () => "hash",
}));
vi.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimit: (...a: unknown[]) => mocks.enforceRateLimit(...a),
}));

const { getUser, jobBySlug, isLeadRecipient, recordAccessRequest, openRequestFor, recordNeonEvent, enforceRateLimit } = mocks;

afterEach(() => vi.resetAllMocks());

const BODY = {
  slug: "abc123",
  intent: "I run this shop",
  preferred_contact_channel: "whatsapp",
  contact_identifier: "+85255550000",
  evidence_ref: "BR12345678",
};

function post(body: unknown = BODY) {
  return import("./route").then(({ POST }) =>
    POST(new Request("https://app.test/api/access-requests", { method: "POST", body: JSON.stringify(body) })),
  );
}

function ready({ eligible = true } = {}) {
  getUser.mockResolvedValue({ id: "u-1", email: "owner@example.test", verified: true });
  enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  jobBySlug.mockResolvedValue({ id: "job-1", share_slug: "abc123", workspace_id: null });
  isLeadRecipient.mockResolvedValue(eligible);
  openRequestFor.mockResolvedValue({ id: "req-1" });
}

describe("POST /api/access-requests", () => {
  it("files a request for an eligible job and records what was said", async () => {
    ready();
    const response = await post();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, requestId: "req-1" });
    expect(recordAccessRequest).toHaveBeenCalledWith("job-1", "u-1");
    expect(recordNeonEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: null,
        event: "access_request.submitted",
        entityType: "workspace_access_request",
        entityId: "req-1",
        payload: expect.objectContaining({
          intent: "I run this shop",
          contact_identifier: "+85255550000",
          evidence_ref: "BR12345678",
        }),
      }),
    );
  });

  // The binding rule. A 404, not a 403: the answer must not confirm the job exists.
  it("answers 404 for a job the caller is not eligible for, writing nothing", async () => {
    ready({ eligible: false });
    expect((await post()).status).toBe(404);
    expect(recordAccessRequest).not.toHaveBeenCalled();
    expect(recordNeonEvent).not.toHaveBeenCalled();
  });

  it("answers 404 for a job that does not exist", async () => {
    ready();
    jobBySlug.mockResolvedValue(null);
    expect((await post()).status).toBe(404);
    expect(isLeadRecipient).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller before touching the database", async () => {
    getUser.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
    expect(jobBySlug).not.toHaveBeenCalled();
  });

  it("fails closed when the limiter refuses", async () => {
    getUser.mockResolvedValue({ id: "u-1", email: "owner@example.test", verified: true });
    enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    expect((await post()).status).toBe(429);
    expect(jobBySlug).not.toHaveBeenCalled();
    // One object argument, not positional -- see lib/security/rate-limit.ts.
    expect(enforceRateLimit).toHaveBeenCalledWith({
      req: expect.anything(),
      scope: "access_request",
      identifiers: ["u-1"],
      failClosed: true,
    });
  });

  it.each([
    ["no slug", { ...BODY, slug: "" }],
    ["no intent", { ...BODY, intent: "   " }],
    ["bad channel", { ...BODY, preferred_contact_channel: "telegram" }],
    ["no contact", { ...BODY, contact_identifier: "" }],
  ])("rejects %s", async (_label, body) => {
    ready();
    expect((await post(body)).status).toBe(400);
    expect(recordAccessRequest).not.toHaveBeenCalled();
  });
});
