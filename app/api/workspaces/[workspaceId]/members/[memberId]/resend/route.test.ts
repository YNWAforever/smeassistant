import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  recordEvent: vi.fn(),
  refreshInvitation: vi.fn(),
  sendInvitation: vi.fn(),
  enforce: vi.fn(),
  consume: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/repositories/claims", () => ({ recordClaimAuditEvent: (...args: unknown[]) => mocks.recordEvent(...args) }));
vi.mock("@/lib/repositories/membership", () => ({
  membershipRepository: { refreshInvitation: (...args: unknown[]) => mocks.refreshInvitation(...args) },
}));
vi.mock("@/lib/mail/invitation", () => ({ sendInvitation: (...args: unknown[]) => mocks.sendInvitation(...args) }));
vi.mock("@/lib/mail/transport", () => ({ createMailTransport: () => ({ send: vi.fn() }) }));
vi.mock("@/lib/db/client", () => ({ getPool: () => ({ query: vi.fn() }) }));
vi.mock("@/lib/repositories/workflow", () => ({ workflowRepository: () => ({ consumeRateLimit: mocks.consume }) }));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/security/rate-limit")>();
  return {
    ...real,
    // The real helper, kept reachable so one test can run it against an in-memory limiter.
    realEnforceRecipientRateLimit: real.enforceRecipientRateLimit,
    enforceRecipientRateLimit: (...args: unknown[]) => mocks.enforce(...args),
  };
});

import * as rateLimit from "@/lib/security/rate-limit";

const { realEnforceRecipientRateLimit } = rateLimit as unknown as {
  realEnforceRecipientRateLimit: typeof rateLimit.enforceRecipientRateLimit;
};

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const EMAIL = "teammate@example.com";
const URL_BASE = `https://app.test/api/workspaces/${WORKSPACE_ID}/members/member-2/resend`;
const PARAMS = { params: Promise.resolve({ workspaceId: WORKSPACE_ID, memberId: "member-2" }) };

function auth(role: "owner" | "manager" | "viewer") {
  return {
    ok: true,
    user: { id: "user-1", email: "o@example.com", verified: true },
    membership: { workspaceId: WORKSPACE_ID, workspaceSlug: "demo", userId: "user-1", email: "o@example.com", role, locationScope: null },
  };
}

function resend(body: unknown = {}) {
  return import("./route").then(({ POST }) => POST(new Request(URL_BASE, { method: "POST", body: JSON.stringify(body) }), PARAMS));
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("INVITATION_MAIL_ENABLED", "true");
  vi.stubEnv("APP_ORIGIN", "https://app.test");
  mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
  mocks.enforce.mockResolvedValue({ allowed: true, retryAfterSeconds: 0, unavailable: false });
  mocks.refreshInvitation.mockResolvedValue({ email: EMAIL, role: "manager", invitedAt: "2026-10-10T01:00:00Z", workspaceName: "Demo" });
  mocks.sendInvitation.mockResolvedValue({ status: "sent" });
  mocks.recordEvent.mockResolvedValue(undefined);
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  expect(JSON.stringify(consoleError.mock.calls)).not.toContain(EMAIL);
  consoleError.mockRestore();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/workspaces/[workspaceId]/members/[memberId]/resend", () => {
  it("404s not_enabled before calling auth when the flag is off", async () => {
    vi.stubEnv("INVITATION_MAIL_ENABLED", "false");
    const res = await resend();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_enabled" });
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("refuses a manager", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    expect((await resend()).status).toBe(403);
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID }, { minRole: "owner" });
    expect(mocks.refreshInvitation).not.toHaveBeenCalled();
  });

  it("429s when the limiter denies, without refreshing", async () => {
    mocks.enforce.mockResolvedValue({ allowed: false, retryAfterSeconds: 120, unavailable: false });
    const res = await resend();
    expect(res.status).toBe(429);
    expect(mocks.enforce).toHaveBeenCalledWith(expect.objectContaining({ scope: "invitation_resend", identifier: "member-2" }));
    expect(mocks.refreshInvitation).not.toHaveBeenCalled();
  });

  it("503s when the limiter is unavailable", async () => {
    mocks.enforce.mockResolvedValue({ allowed: false, retryAfterSeconds: 60, unavailable: true });
    expect((await resend()).status).toBe(503);
    expect(mocks.refreshInvitation).not.toHaveBeenCalled();
  });

  // Spec D2: 3 a day per member, not per member per source IP. Requests from
  // different IPs must spend the same bucket.
  it("bounds the per-member bucket across source IPs", async () => {
    const buckets = new Map<string, number>();
    mocks.consume.mockImplementation(async (key: string, limit: number) => {
      const used = (buckets.get(key) ?? 0) + 1;
      buckets.set(key, used);
      return { allowed: used <= limit, retry_after_seconds: used <= limit ? 0 : 3600 };
    });
    mocks.enforce.mockImplementation(realEnforceRecipientRateLimit);
    const { POST } = await import("./route");
    const from = (ip: string) => POST(
      new Request(URL_BASE, { method: "POST", headers: { "x-forwarded-for": ip }, body: "{}" }),
      { params: Promise.resolve({ workspaceId: WORKSPACE_ID, memberId: "member-2" }) },
    );

    for (const ip of ["203.0.113.1", "203.0.113.2", "203.0.113.3"]) expect((await from(ip)).status).toBe(200);
    expect((await from("203.0.113.4")).status).toBe(429);
    expect(mocks.refreshInvitation).toHaveBeenCalledTimes(3);
    const memberKey = rateLimit.rateLimitBucketKey("invitation_resend", "member-2");
    expect(buckets.get(memberKey)).toBe(4);
    expect([...buckets.keys()].filter((key) => key.startsWith("invitation_resend:"))).toEqual([memberKey]);
  });

  it("404s not_found and sends nothing when there is no pending invitation", async () => {
    mocks.refreshInvitation.mockResolvedValue(null);
    const res = await resend();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(mocks.sendInvitation).not.toHaveBeenCalled();
  });

  it("sends, audits member.invitation_resent and returns the status and invitedAt", async () => {
    const res = await resend({ locale: "en" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ invitation: { status: "sent" }, invitedAt: "2026-10-10T01:00:00Z" });
    expect(mocks.refreshInvitation).toHaveBeenCalledWith(WORKSPACE_ID, "member-2");
    expect(mocks.sendInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE_ID, locale: "en", origin: "https://app.test", member: { id: "member-2", email: EMAIL, role: "manager", invitedAt: "2026-10-10T01:00:00Z" } }),
    );
    expect(mocks.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: WORKSPACE_ID, actor_type: "user", actor_id: "user-1", event: "member.invitation_resent", entity_type: "workspace_member", entity_id: "member-2", payload: { locale: "en" } }),
    );
  });

  it("reports failed when the send throws, and still audits", async () => {
    mocks.sendInvitation.mockRejectedValue(new Error(`boom ${EMAIL}`));
    const res = await resend();
    expect(res.status).toBe(200);
    expect((await res.json()).invitation).toEqual({ status: "failed" });
    expect(mocks.recordEvent).toHaveBeenCalled();
  });
});
