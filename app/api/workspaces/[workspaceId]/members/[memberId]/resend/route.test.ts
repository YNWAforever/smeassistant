import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  recordEvent: vi.fn(),
  refreshInvitation: vi.fn(),
  sendInvitation: vi.fn(),
  enforce: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/repositories/claims", () => ({ recordClaimAuditEvent: (...args: unknown[]) => mocks.recordEvent(...args) }));
vi.mock("@/lib/repositories/membership", () => ({
  membershipRepository: { refreshInvitation: (...args: unknown[]) => mocks.refreshInvitation(...args) },
}));
vi.mock("@/lib/mail/invitation", () => ({ sendInvitation: (...args: unknown[]) => mocks.sendInvitation(...args) }));
vi.mock("@/lib/mail/transport", () => ({ createMailTransport: () => ({ send: vi.fn() }) }));
vi.mock("@/lib/db/client", () => ({ getPool: () => ({ query: vi.fn() }) }));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/rate-limit")>()),
  enforceCompositeIdentifierRateLimit: (...args: unknown[]) => mocks.enforce(...args),
}));

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
    expect(mocks.enforce).toHaveBeenCalledWith(expect.objectContaining({ scope: "invitation_resend", identifier: "member-2", failClosed: true }));
    expect(mocks.refreshInvitation).not.toHaveBeenCalled();
  });

  it("503s when the limiter is unavailable", async () => {
    mocks.enforce.mockResolvedValue({ allowed: false, retryAfterSeconds: 60, unavailable: true });
    expect((await resend()).status).toBe(503);
    expect(mocks.refreshInvitation).not.toHaveBeenCalled();
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
