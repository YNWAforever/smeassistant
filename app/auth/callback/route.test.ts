import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ signOut: vi.fn(), middleware: vi.fn(), exchangeFixtureVerifier: vi.fn() }));
vi.mock("@/lib/auth", () => ({ signOut: mocks.signOut }));
vi.mock("@/lib/identity/neon", () => ({ getNeonAuth: () => ({ middleware: () => mocks.middleware }) }));
vi.mock("@/test/e2e/composition", () => ({ exchangeFixtureVerifier: mocks.exchangeFixtureVerifier }));
import { GET } from "./route";
const request = (query: string) => new Request(`https://app.test/auth/callback?${query}`);
beforeEach(() => { vi.clearAllMocks(); delete process.env.SME_TEST_IDENTITY; mocks.signOut.mockResolvedValue(undefined); mocks.middleware.mockResolvedValue(new Response(null, { status: 307, headers: { location: "https://app.test/auth/callback?locale=en&returnTo=%2Fen%2Fowner%2Ffixture", "set-cookie": "__Secure-neon-auth.session_token=fixture; Path=/" } })); });
afterEach(() => { delete process.env.SME_TEST_IDENTITY; vi.restoreAllMocks(); });
describe("GET /auth/callback", () => {
  it("exchanges a verifier then preserves SDK cookies while redirecting exactly once to completion", async () => {
    const response = await GET(request("locale=en&returnTo=%2Fen%2Fowner%2Ffixture&neon_auth_session_verifier=fixture"));
    expect(response.headers.get("location")).toBe("https://app.test/en/owner/sign-in/complete?returnTo=%2Fen%2Fowner%2Ffixture");
    expect(response.headers.get("set-cookie")).toContain("session_token=fixture");
  });
  it("sends a verifier-free callback to completion without application authorization work", async () => {
    const response = await GET(request("locale=en&claim=fixture-report"));
    expect(response.headers.get("location")).toBe("https://app.test/en/owner/sign-in/complete?claim=fixture-report");
    expect(mocks.middleware).not.toHaveBeenCalled(); expect(mocks.signOut).not.toHaveBeenCalled();
  });
  it("keeps validated context and returns only generic recovery for managed-auth errors", async () => {
    mocks.middleware.mockRejectedValue(new Error("private provider detail")); const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(request("locale=en&claim=fixture-report&method=google&neon_auth_session_verifier=fixture"));
    expect(response.headers.get("location")).toBe("https://app.test/en/owner/sign-in?claim=fixture-report&method=google&error=auth_unavailable");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("private provider detail"); spy.mockRestore();
  });
  it("rejects a managed provider error and preserves the parsed flow", async () => {
    const response = await GET(request("locale=zh-TW&claim=fixture-report&method=email&error=access_denied"));
    expect(response.headers.get("location")).toBe("https://app.test/zh-TW/owner/sign-in?claim=fixture-report&method=email&error=cancelled"); expect(mocks.signOut).toHaveBeenCalledOnce();
  });
  it("fails closed when a fixture verifier exchange produces no response", async () => {
    process.env.SME_TEST_IDENTITY = "owned-local";
    mocks.exchangeFixtureVerifier.mockResolvedValue(null);
    const response = await GET(request("locale=en&method=google&neon_auth_session_verifier=fixture"));
    expect(response.headers.get("location")).toBe("https://app.test/en/owner/sign-in?method=google&error=invalid_code");
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});