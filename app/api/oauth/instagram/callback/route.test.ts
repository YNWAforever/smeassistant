import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  workspace: vi.fn(),
  accepted: vi.fn(),
  replaceConnection: vi.fn(),
  recordClaimAuditEvent: vi.fn(),
  encryptToken: vi.fn((plaintext: string) => `enc:${plaintext}`),
  verifyInstagramState: vi.fn(),
  exchangeInstagramCode: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getUser: async () => { const response = await mocks.getUser(); const user = response?.data?.user; return user ? { ...user, verified: true } : null; } }));
vi.mock("@/lib/repositories/membership", () => ({ membershipRepository: {
  workspace: mocks.workspace,
  accepted: mocks.accepted,
} }));
vi.mock("@/lib/repositories/claims", () => ({ recordClaimAuditEvent: mocks.recordClaimAuditEvent }));
vi.mock("@/lib/repositories/instagram-connection", () => ({ instagramConnectionRepository: () => ({ replaceConnection: mocks.replaceConnection }) }));
vi.mock("@/lib/security/token-crypto", () => ({ encryptToken: mocks.encryptToken }));
vi.mock("@/lib/oauth/instagram-connection", () => ({
  verifyInstagramState: mocks.verifyInstagramState,
  exchangeInstagramCode: mocks.exchangeInstagramCode,
}));

import { GET } from "./route";

function request(query: string): Request {
  return new Request(`https://scanner.test/api/oauth/instagram/callback${query}`);
}

function location(response: Response): URL {
  return new URL(response.headers.get("location")!);
}

const STATE = { workspaceId: "ws-1", nonce: "n", issuedAt: Date.now(), locale: "en" };

const ACCOUNT = { id: "17841400000000000", username: "eldage" };

const TOKENS = { accessToken: "token-abc", expiresAt: "2027-01-17T00:00:00.000Z", scopes: ["instagram_basic"] };

function tables({ role, slug = "demo-cafe" }: { role: string | null; slug?: string | null }) {
  mocks.workspace.mockResolvedValue({ id: "ws-1", slug });
  mocks.accepted.mockResolvedValue(role ? { role } : null);
  mocks.replaceConnection.mockResolvedValue("conn-1");
  mocks.recordClaimAuditEvent.mockResolvedValue(undefined);
}

describe("GET /api/oauth/instagram/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyInstagramState.mockReturnValue(STATE);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    tables({ role: "owner" });
  });

  it("redirects declined consent without calling the session or Meta", async () => {
    const response = await GET(request("?error=access_denied"));
    const url = location(response);

    expect(response.status).toBe(307);
    expect(url.searchParams.get("instagram")).toBe("declined");
    // No verifiable state, so no workspace is known: fall back to the locale-
    // prefixed picker, never an unprefixed path.
    expect(url.pathname).toBe("/zh-HK/owner/select-workspace");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.exchangeInstagramCode).not.toHaveBeenCalled();
  });

  it("sends a decline back to the workspace's integrations page when the state verifies", async () => {
    const url = location(await GET(request("?error=access_denied&state=good")));
    expect(url.searchParams.get("instagram")).toBe("declined");
    expect(url.pathname).toBe("/en/owner/demo-cafe/business/integrations");
    expect(mocks.exchangeInstagramCode).not.toHaveBeenCalled();
  });

  it("rejects a state signature that does not verify", async () => {
    mocks.verifyInstagramState.mockReturnValue(null);
    const url = location(await GET(request("?code=abc&state=bad-signature")));

    expect(url.searchParams.get("instagram")).toBe("invalid_state");
    expect(url.pathname).toBe("/zh-HK/owner/select-workspace");
    expect(mocks.exchangeInstagramCode).not.toHaveBeenCalled();
  });

  it("rejects a missing code without touching Meta", async () => {
    const url = location(await GET(request("?state=good")));
    expect(url.searchParams.get("instagram")).toBe("invalid");
    expect(mocks.exchangeInstagramCode).not.toHaveBeenCalled();
  });

  it("refuses a caller who is not an accepted owner", async () => {
    tables({ role: "manager" });
    const url = location(await GET(request("?code=abc&state=good")));

    expect(url.searchParams.get("instagram")).toBe("forbidden");
    expect(mocks.exchangeInstagramCode).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const url = location(await GET(request("?code=abc&state=good")));
    expect(url.searchParams.get("instagram")).toBe("unauthenticated");
    expect(mocks.exchangeInstagramCode).not.toHaveBeenCalled();
  });

  it("forwards a content-free exchange failure reason", async () => {
    mocks.exchangeInstagramCode.mockResolvedValue({ ok: false, reason: "missing_permissions" });
    const url = location(await GET(request("?code=abc&state=good")));

    expect(url.searchParams.get("instagram")).toBe("missing_permissions");
    expect(url.pathname).toBe("/en/owner/demo-cafe/business/integrations");
    expect(mocks.replaceConnection).not.toHaveBeenCalled();
  });

  it("stores an encrypted long-lived token and audits the connected account", async () => {
    mocks.exchangeInstagramCode.mockResolvedValue({ ok: true, tokens: TOKENS, account: ACCOUNT });

    const url = location(await GET(request("?code=abc&state=good")));

    expect(url.searchParams.get("instagram")).toBe("ok");
    expect(url.pathname).toBe("/en/owner/demo-cafe/business/integrations");
    expect(mocks.encryptToken).toHaveBeenCalledWith("token-abc");
    expect(mocks.replaceConnection).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      // The id is kept for the later publishing/insight calls; the username is
      // what the owner sees. One JSON field, documented in the repository.
      accountRef: JSON.stringify(ACCOUNT),
      accessTokenEncrypted: "enc:token-abc",
      scopes: TOKENS.scopes,
      expiresAt: TOKENS.expiresAt,
    });
    expect(mocks.recordClaimAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      workspace_id: "ws-1",
      event: "integration.updated",
      payload: expect.objectContaining({ provider: "instagram", status: "connected" }),
    }));
  });

  it("still reports ok when the audit write fails, because the credential is already stored", async () => {
    mocks.exchangeInstagramCode.mockResolvedValue({ ok: true, tokens: TOKENS, account: ACCOUNT });
    mocks.recordClaimAuditEvent.mockRejectedValue(new Error("audit down"));

    const url = location(await GET(request("?code=abc&state=good")));

    expect(url.searchParams.get("instagram")).toBe("ok");
    expect(mocks.replaceConnection).toHaveBeenCalled();
  });

  it("reports storage_failed without claiming a connection when encryption or SQL fails", async () => {
    mocks.exchangeInstagramCode.mockResolvedValue({ ok: true, tokens: TOKENS, account: ACCOUNT });
    mocks.replaceConnection.mockRejectedValue(new Error("OAUTH_TOKEN_ENCRYPTION_KEY must be at least 32 bytes in production"));

    const url = location(await GET(request("?code=abc&state=good")));

    expect(url.searchParams.get("instagram")).toBe("storage_failed");
    expect(mocks.recordClaimAuditEvent).not.toHaveBeenCalled();
  });
});
