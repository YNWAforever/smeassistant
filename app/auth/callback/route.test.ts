import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  getIdentity: vi.fn(),
  resolveApplicationUser: vi.fn(),
  bindWorkspaceToUser: vi.fn(),
  findOwnedWorkspace: vi.fn(),
  claimScan: vi.fn(),
  middleware: vi.fn(),
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
  results: {} as Record<string, unknown>,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

vi.mock("@/lib/auth", () => ({ getUser: mocks.getUser, signOut: mocks.signOut }));
vi.mock("@/lib/identity/composition", () => ({
  identityProvider: async () => ({ getIdentity: mocks.getIdentity }),
}));
vi.mock("@/lib/identity/users", () => ({ resolveApplicationUser: mocks.resolveApplicationUser }));
vi.mock("@/lib/identity/neon", () => ({
  getNeonAuth: () => ({ middleware: () => mocks.middleware }),
}));
vi.mock("@/lib/workspace/bind-workspace", () => ({
  bindWorkspaceToUser: mocks.bindWorkspaceToUser,
}));
vi.mock("@/lib/workspace/callback-queries", () => ({
  bindPendingMembership: async (user: unknown) => {
    mocks.calls.push({ table: "members", method: "bind", args: [user] });
    return null;
  },
  findOwnedWorkspace: mocks.findOwnedWorkspace,
  createWorkspaceWithOwner: vi.fn(),
  attachJobToWorkspace: vi.fn(),
}));
vi.mock("@/lib/workspace/claim-scan", () => ({ claimScan: mocks.claimScan }));

vi.mock("@/lib/repositories/membership", () => ({ membershipRepository: {
 bindPending: async (user:unknown) => {mocks.calls.push({table:"members",method:"bind",args:[user]});return null;},
 ownedWorkspace: async () => null,
} }));
vi.mock("@/lib/repositories/claims", () => ({ claimsRepository: {
 jobBySlug: async () => (mocks.results.audit_jobs as {data:unknown}).data,
 recordAccessRequest: async (...args:unknown[]) => {mocks.calls.push({table:"workspace_access_requests",method:"insert",args});},
 firstLeadEmail: async () => null, createWorkspaceWithOwner: vi.fn(), attachJob: vi.fn(),
} }));

import { GET } from "./route";

function request(query: string) {
  return new Request(`https://app.test/auth/callback?${query}`);
}

const originalSelfService = process.env.OWNER_SELF_SERVICE_CLAIM;

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.calls.length = 0;
    // Guardrail 15: never enabled. The tests assert the default path.
    delete process.env.OWNER_SELF_SERVICE_CLAIM;
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({
      id: "user-1", email: "Owner@Example.com", verified: true,
    });
    mocks.getIdentity.mockResolvedValue({
      provider: "neon", subject: "identity-1", email: "Owner@Example.com", verified: true,
    });
    mocks.resolveApplicationUser.mockResolvedValue({
      id: "user-1", email: "Owner@Example.com", verified: true,
    });
    mocks.bindWorkspaceToUser.mockImplementation(async (input: { bindByEmail: () => Promise<string | null> }) => {
      await input.bindByEmail();
      return { kind: "none" };
    });
    mocks.findOwnedWorkspace.mockResolvedValue({ data: null, error: null });
    mocks.claimScan.mockResolvedValue({ kind: "requires_verification" });
    mocks.middleware.mockResolvedValue(new Response(null, { status: 307 }));
    mocks.results = {
      workspace_members: { data: [], error: null },
      audit_jobs: { data: { id: "job-1", workspace_id: null, business_name: "Kam Man House" }, error: null },
      workspace_access_requests: { data: null, error: null },
    };
  });

  afterEach(() => {
    if (originalSelfService === undefined) delete process.env.OWNER_SELF_SERVICE_CLAIM;
    else process.env.OWNER_SELF_SERVICE_CLAIM = originalSelfService;
  });

  it("signs out and lands on the locale sign-in page when the code is missing", async () => {
    mocks.getIdentity.mockResolvedValue(null);
    const response = await GET(request("claim=abcdef&locale=zh-TW"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.test/zh-TW/owner/sign-in?claim=abcdef&error=not_authorized",
    );
    expect(mocks.signOut).toHaveBeenCalledWith();
  });

  it("falls back to the default locale when the locale param is unknown", async () => {
    mocks.getIdentity.mockResolvedValue(null);
    const response = await GET(request("locale=fr"));
    expect(response.headers.get("location")).toBe("https://app.test/zh-HK/owner/sign-in?error=not_authorized");
  });

  it("reports an invalid code without a session", async () => {
    mocks.getIdentity.mockResolvedValue(null);
    const response = await GET(request("error=expired_token&locale=en"));
    expect(response.headers.get("location")).toBe("https://app.test/en/owner/sign-in?error=invalid_code");
    expect(mocks.signOut).toHaveBeenCalledWith();
  });

  it("refuses an unverified email", async () => {
    mocks.resolveApplicationUser.mockResolvedValue({ id: "user-1", email: "x@y.com", verified: false });
    const response = await GET(request("code=abc&locale=en"));
    expect(response.headers.get("location")).toBe("https://app.test/en/owner/sign-in?error=not_authorized");
  });

  it("binds pending memberships and honours a same-origin returnTo", async () => {
    const response = await GET(request("code=abc&locale=en&returnTo=%2Fen%2Fowner%2Fkam-man-house%3Ftab%3Dactions"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.test/en/owner/kam-man-house?tab=actions");

    expect(mocks.calls).toContainEqual({table:"members",method:"bind",args:[{id:"user-1",email:"Owner@Example.com",verified:true}]});
  });

  it("ignores a returnTo that is not a same-origin path", async () => {
    for (const bad of ["https://evil.example/x", "//evil.example", "/\\evil.example", "/%252fevil.example", "/en/%0a", "owner"]) {
      mocks.calls.length = 0;
      const response = await GET(request(`code=abc&locale=en&returnTo=${encodeURIComponent(bad)}`));
      expect(response.headers.get("location")).toBe("https://app.test/en/owner/select-workspace");
    }
  });

  it("lands on select-workspace when nothing else is carried", async () => {
    const response = await GET(request("code=abc"));
    expect(response.headers.get("location")).toBe("https://app.test/zh-HK/owner/select-workspace");
  });

  it("routes a claim to onboarding with the claim outcome, self-service off", async () => {
    const response = await GET(request("code=abc&claim=abcdef&locale=zh-HK"));
    expect(response.headers.get("location")).toBe(
      "https://app.test/zh-HK/owner/onboarding?claim=abcdef&claimed=requires_verification",
    );
    // A signed-in user with no workspace who named a report gets an access
    // request recorded for staff assignment.
    expect(mocks.calls).toContainEqual(
      expect.objectContaining({ table: "workspace_access_requests", method: "insert" }),
    );
    // Nothing was attached: the claim needs Google verification.
    expect(mocks.calls.find((c) => c.table === "audit_jobs" && c.method === "update")).toBeUndefined();
  });

  it("prefers the claim over returnTo", async () => {
    const response = await GET(request("code=abc&claim=abcdef&locale=en&returnTo=%2Fen%2Fowner%2Fx"));
    expect(response.headers.get("location")).toBe(
      "https://app.test/en/owner/onboarding?claim=abcdef&claimed=requires_verification",
    );
  });

  it("drops a malformed claim slug before it reaches a path", async () => {
    mocks.getIdentity.mockResolvedValue(null);
    const response = await GET(request("claim=..%2F..%2Fen%2Fstaff&locale=en"));
    expect(response.headers.get("location")).toBe("https://app.test/en/owner/sign-in?error=not_authorized");
  });

  it("lands on sign-in with auth_unavailable when the auth client throws", async () => {
    mocks.resolveApplicationUser.mockRejectedValue(new Error("down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(request("code=abc&claim=abcdef&locale=en"));
    expect(response.headers.get("location")).toBe(
      "https://app.test/en/owner/sign-in?claim=abcdef&error=auth_unavailable",
    );
    errorSpy.mockRestore();
  });
  it.each([
    ["verifier_exchange", () => {
      mocks.middleware.mockRejectedValue(sensitiveFailure());
      return request("locale=en&neon_auth_session_verifier=fixture");
    }],
    ["fresh_session", () => {
      mocks.getIdentity.mockRejectedValue(sensitiveFailure());
      return request("locale=en");
    }],
    ["identity_mapping", () => {
      mocks.resolveApplicationUser.mockRejectedValue(sensitiveFailure());
      return request("locale=en");
    }],
    ["invitation_binding", () => {
      mocks.bindWorkspaceToUser.mockRejectedValue(sensitiveFailure());
      return request("locale=en");
    }],
    ["workspace_lookup", () => {
      mocks.findOwnedWorkspace.mockRejectedValue(sensitiveFailure());
      return request("locale=en");
    }],
    ["claim_resolution", () => {
      mocks.claimScan.mockRejectedValue(sensitiveFailure());
      return request("locale=en&claim=abcdef");
    }],
  ] as const)("logs a redacted diagnostic when %s fails", async (stage, run) => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(run());
    const publicResponse = response.headers.get("location") ?? "";
    const logged = JSON.stringify(errorSpy.mock.calls);

    expect(response.status).toBe(307);
    expect(publicResponse).toContain("error=auth_unavailable");
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({
      event: "owner_sign_in_failed",
      stage,
      correlationId: expect.any(String),
    }));
    for (const privateValue of ["sentinel@example.test", "session_token", "verifier=fixture", "SELECT * FROM app_users"]) {
      expect(logged).not.toContain(privateValue);
      expect(publicResponse).not.toContain(privateValue);
    }
    errorSpy.mockRestore();
  });

  it("treats a missing fresh session as unauthorized rather than an outage", async () => {
    mocks.getIdentity.mockResolvedValue(null);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(request("locale=en"));
    expect(response.headers.get("location")).toBe("https://app.test/en/owner/sign-in?error=not_authorized");
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});


function sensitiveFailure() {
  return new Error("sentinel@example.test __Secure-neon-auth.session_token=private verifier=fixture SELECT * FROM app_users");
}
