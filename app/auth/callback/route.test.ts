import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
  results: {} as Record<string, unknown>,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: mocks })),
}));

/** Every query on a table resolves to mocks.results[table]; the chain records its calls. */
function chain(table: string) {
  const c: Record<string, unknown> = {};
  for (const method of ["select", "update", "insert", "eq", "is", "not", "order", "limit", "maybeSingle", "single"]) {
    c[method] = (...args: unknown[]) => {
      mocks.calls.push({ table, method, args });
      return c;
    };
  }
  c.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(mocks.results[table] ?? { data: null, error: null }).then(resolve, reject);
  return c;
}

vi.mock("@/lib/supabase/admin", () => ({
  supabaseServer: () => ({ from: (table: string) => chain(table) }),
}));

import { GET } from "./route";

function request(query: string) {
  return new Request(`https://app.test/auth/callback?${query}`);
}

const originalSelfService = process.env.OWNER_SELF_SERVICE_CLAIM;

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    // Guardrail 15: never enabled. The tests assert the default path.
    delete process.env.OWNER_SELF_SERVICE_CLAIM;
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "Owner@Example.com", email_confirmed_at: "2026-09-01T00:00:00Z" } },
      error: null,
    });
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
    const response = await GET(request("claim=abcdef&locale=zh-TW"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.test/zh-TW/owner/sign-in?claim=abcdef&error=missing_code",
    );
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("falls back to the default locale when the locale param is unknown", async () => {
    const response = await GET(request("locale=fr"));
    expect(response.headers.get("location")).toBe("https://app.test/zh-HK/owner/sign-in?error=missing_code");
  });

  it("reports an invalid code without a session", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: { message: "bad" } });
    const response = await GET(request("code=abc&locale=en"));
    expect(response.headers.get("location")).toBe("https://app.test/en/owner/sign-in?error=invalid_code");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("refuses an unverified email", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "x@y.com" } }, error: null });
    const response = await GET(request("code=abc&locale=en"));
    expect(response.headers.get("location")).toBe("https://app.test/en/owner/sign-in?error=not_authorized");
  });

  it("binds pending memberships and honours a same-origin returnTo", async () => {
    const response = await GET(request("code=abc&locale=en&returnTo=%2Fen%2Fowner%2Fkam-man-house%3Ftab%3Dactions"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.test/en/owner/kam-man-house?tab=actions");

    const bind = mocks.calls.find((c) => c.table === "workspace_members" && c.method === "update");
    expect(bind?.args[0]).toMatchObject({ user_id: "user-1" });
    expect(mocks.calls).toContainEqual({ table: "workspace_members", method: "eq", args: ["email", "owner@example.com"] });
    expect(mocks.calls).toContainEqual({ table: "workspace_members", method: "is", args: ["user_id", null] });
  });

  it("ignores a returnTo that is not a same-origin path", async () => {
    for (const bad of ["https://evil.example/x", "//evil.example", "/\\evil.example", "owner"]) {
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
    const response = await GET(request("claim=..%2F..%2Fen%2Fstaff&locale=en"));
    expect(response.headers.get("location")).toBe("https://app.test/en/owner/sign-in?error=missing_code");
  });

  it("lands on sign-in with auth_unavailable when the auth client throws", async () => {
    mocks.exchangeCodeForSession.mockRejectedValue(new Error("down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(request("code=abc&claim=abcdef&locale=en"));
    expect(response.headers.get("location")).toBe(
      "https://app.test/en/owner/sign-in?claim=abcdef&error=auth_unavailable",
    );
    errorSpy.mockRestore();
  });
});
