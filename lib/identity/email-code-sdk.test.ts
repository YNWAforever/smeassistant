import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rateLimit: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn() }), headers: async () => new Headers({ origin: "https://app.test" }) }));
vi.mock("@/lib/security/rate-limit", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/security/rate-limit")>(),
  enforceCompositeIdentifierRateLimit: mocks.rateLimit,
}));
beforeEach(() => {
  vi.resetModules();
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.test/auth");
  vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "fixture-secret-at-least-32-characters");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("the pinned server SDK sends a sign-in OTP, without a callback or other email action", async () => {
  const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe("https://auth.example.test/auth/email-otp/send-verification-otp");
    expect(JSON.parse(init!.body as string)).toEqual({ email: "owner@example.test", type: "sign-in" });
    return Response.json({ success: true });
  });
  vi.stubGlobal("fetch", transport);
  const { sendEmailCode } = await import("./composition");
  expect((await sendEmailCode("owner@example.test")).error).toBeNull();
  expect(transport).toHaveBeenCalledOnce();
});

it("the same-origin SDK code verification returns a fresh session without an OAuth challenge or old account", async () => {
  const session = { user: { id: "new-user", email: "owner@example.test", emailVerified: true }, session: { id: "session", userId: "new-user", token: "new-session", expiresAt: new Date(Date.now() + 60_000).toISOString() } };
  let verified = false;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://auth.example.test");
    if (url.pathname === "/auth/sign-in/email-otp") {
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("cookie")).toBe("");
      expect(new Headers(init?.headers).get("authorization")).toBeNull();
      expect(JSON.parse(init!.body as string)).toEqual({ email: "owner@example.test", otp: "123456" });
      verified = true;
      return Response.json(session, { headers: { "set-cookie": "__Secure-neon-auth.session_token=new-session; Path=/; Secure; HttpOnly" } });
    }
    expect(url.pathname).toBe("/auth/get-session");
    expect(verified).toBe(true);
    return Response.json(session);
  }));
  const { POST } = await import("@/app/api/auth/[...path]/route");
  const response = await POST(new Request("https://app.test/api/auth/sign-in/email-otp", {
    method: "POST", headers: { origin: "https://app.test", cookie: "__Secure-neon-auth.session_token=old-account" },
    body: JSON.stringify({ email: "OWNER@example.test", otp: "123456" }),
  }), { params: Promise.resolve({ path: ["sign-in", "email-otp"] }) });
  expect(response.status).toBe(200);
  expect((await response.json()).user.id).toBe("new-user");
  expect(response.headers.get("set-cookie")).toContain("session_token=new-session");
});
