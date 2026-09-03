import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  verifyState: vi.fn(),
  exchangeCode: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => ({ from: mocks.from }) }));
vi.mock("@/lib/oauth/google-connection", () => ({
  GBP_SCOPE_REQUIRED: "https://www.googleapis.com/auth/business.manage",
  verifyState: mocks.verifyState,
  exchangeCode: mocks.exchangeCode,
}));

import { GET } from "./route";

function request(query: string): Request {
  return new Request(`https://scanner.test/api/oauth/google/callback${query}`);
}

const STATE = { workspaceId: "ws-1", nonce: "n", issuedAt: Date.now(), locale: "en" };

const TOKENS = {
  accessToken: "token-abc",
  refreshToken: "refresh-abc",
  expiresAt: "2026-09-01T00:00:00.000Z",
  scopes: ["https://www.googleapis.com/auth/business.manage"],
};

/** workspaces / workspace_members / oauth_connections / audit_events with all-success responses. */
function tables({ role, slug = "demo-cafe" }: { role: string | null; slug?: string | null }) {
  const connectionInsert = vi.fn(() => ({
    select: () => ({ single: async () => ({ data: { id: "conn-1" }, error: null }) }),
  }));
  const update = vi.fn((payload: { status: string }) =>
    payload.status === "revoked"
      ? { eq: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }
      : { eq: async () => ({ error: null }) },
  );
  const auditInsert = vi.fn(async () => ({ error: null }));
  mocks.from.mockImplementation((table: string) => {
    if (table === "workspaces") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "ws-1", slug }, error: null }) }) }) };
    }
    if (table === "workspace_members") {
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ not: () => ({ maybeSingle: async () => ({ data: role ? { role } : null, error: null }) }) }) }),
        }),
      };
    }
    if (table === "oauth_connections") return { insert: connectionInsert, update };
    if (table === "audit_events") return { insert: auditInsert };
    throw new Error(`unexpected table ${table}`);
  });
  return { connectionInsert, update, auditInsert };
}

function location(response: Response): URL {
  return new URL(response.headers.get("location")!);
}

describe("GET /api/oauth/google/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects declined consent without calling the session or the token endpoint", async () => {
    const response = await GET(request("?error=access_denied"));

    expect(response.status).toBe(307);
    const url = location(response);
    expect(url.searchParams.get("connected")).toBe("declined");
    // No verifiable state, so no workspace is known: fall back to the locale-
    // prefixed picker, never upstream's unprefixed /owner.
    expect(url.pathname).toBe("/zh-HK/owner/select-workspace");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
  });

  it("sends a decline back to the workspace's integrations page when the echoed state verifies", async () => {
    mocks.verifyState.mockReturnValue(STATE);
    tables({ role: "owner" });

    const url = location(await GET(request("?error=access_denied&state=good")));

    expect(url.searchParams.get("connected")).toBe("declined");
    expect(url.pathname).toBe("/en/owner/demo-cafe/settings/integrations");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
  });

  it("rejects a state signature that does not verify", async () => {
    mocks.verifyState.mockReturnValue(null);
    const response = await GET(request("?code=abc&state=bad-signature"));

    expect(response.status).toBe(307);
    const url = location(response);
    expect(url.searchParams.get("connected")).toBe("invalid_state");
    expect(url.pathname).toBe("/zh-HK/owner/select-workspace");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("leaks no provider text when the code exchange fails", async () => {
    mocks.verifyState.mockReturnValue(STATE);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    tables({ role: "owner" });
    // Simulates Google's token endpoint rejecting the code, which is the real
    // exchange_failed path in the route.
    mocks.exchangeCode.mockResolvedValue(null);

    const response = await GET(request("?code=abc&state=good-signature"));

    expect(response.status).toBe(307);
    const url = location(response);
    expect(url.searchParams.get("connected")).toBe("exchange_failed");
    expect(url.pathname).toBe("/en/owner/demo-cafe/settings/integrations");

    const body = await response.text();
    const serialized = `${body}${url.toString()}`;
    expect(serialized).not.toMatch(/client_secret|refresh_token|googleapis/i);
  });

  it("refuses a workspace the signed-in user is not a member of, without revealing its slug", async () => {
    mocks.verifyState.mockReturnValue(STATE);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-2", email: "someone-else@example.com" } } });
    tables({ role: null });

    const response = await GET(request("?code=abc&state=good-signature"));

    expect(response.status).toBe(307);
    const url = location(response);
    expect(url.searchParams.get("connected")).toBe("forbidden");
    expect(url.pathname).toBe("/en/owner/select-workspace");
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
  });

  it("refuses a viewer completing a consent flow they were never allowed to start", async () => {
    mocks.verifyState.mockReturnValue(STATE);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-3", email: "viewer@example.com" } } });
    tables({ role: "viewer" });

    const response = await GET(request("?code=abc&state=good-signature"));

    expect(response.status).toBe(307);
    expect(location(response).searchParams.get("connected")).toBe("forbidden");
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
  });

  it("allows a manager to complete the Google OAuth consent flow", async () => {
    mocks.verifyState.mockReturnValue(STATE);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-4", email: "manager@example.com" } } });
    tables({ role: "manager" });
    mocks.exchangeCode.mockResolvedValue(TOKENS);

    const response = await GET(request("?code=abc&state=good-signature"));

    expect(response.status).toBe(307);
    expect(mocks.exchangeCode).toHaveBeenCalled();
    expect(location(response).searchParams.get("connected")).toBe("ok");
  });

  it("stores the connection insert-then-promote, records an audit event and lands on the workspace's integrations page", async () => {
    mocks.verifyState.mockReturnValue(STATE);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    const { connectionInsert, update, auditInsert } = tables({ role: "owner" });
    mocks.exchangeCode.mockResolvedValue(TOKENS);

    const url = location(await GET(request("?code=abc&state=good-signature")));

    expect(url.pathname).toBe("/en/owner/demo-cafe/settings/integrations");
    expect(url.searchParams.get("connected")).toBe("ok");
    expect(connectionInsert).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: "ws-1", provider: "google_gbp", status: "expired" }),
    );
    expect(update.mock.calls.map(([payload]) => (payload as { status: string }).status)).toEqual(["revoked", "active"]);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "ws-1",
        actor_type: "user",
        actor_id: "user-1",
        event: "integration.updated",
        entity_id: "conn-1",
        payload: expect.objectContaining({ locale: "en" }),
      }),
    );
  });

  it("falls back to the default locale when the state carries none", async () => {
    mocks.verifyState.mockReturnValue({ workspaceId: "ws-1", nonce: "n", issuedAt: Date.now() });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    tables({ role: "owner" });
    mocks.exchangeCode.mockResolvedValue(TOKENS);

    const url = location(await GET(request("?code=abc&state=good-signature")));

    expect(url.pathname).toBe("/zh-HK/owner/demo-cafe/settings/integrations");
  });

  it("falls back to the picker when the workspace has no slug yet", async () => {
    // A pre-backfill workspaces row: the connection is still stored, only the
    // redirect target degrades.
    mocks.verifyState.mockReturnValue(STATE);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    tables({ role: "owner", slug: null });
    mocks.exchangeCode.mockResolvedValue(TOKENS);

    const url = location(await GET(request("?code=abc&state=good-signature")));

    expect(url.searchParams.get("connected")).toBe("ok");
    expect(url.pathname).toBe("/en/owner/select-workspace");
  });
});
