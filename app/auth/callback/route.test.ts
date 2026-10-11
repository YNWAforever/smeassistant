import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ signOut: vi.fn(), middleware: vi.fn(), exchangeFixtureVerifier: vi.fn() }));
vi.mock("@/lib/auth", () => ({ signOut: mocks.signOut }));
vi.mock("@/lib/identity/neon", () => ({ getNeonAuth: () => ({ middleware: () => mocks.middleware }) }));
vi.mock("@/test/e2e/composition", () => ({ exchangeFixtureVerifier: mocks.exchangeFixtureVerifier }));
import { GET } from "./route";
import { MANAGED_AUTH_COOKIES } from "@/lib/identity/cookies";
const request = (query: string) => new Request(`https://app.test/auth/callback?${query}`);
beforeEach(() => { vi.clearAllMocks(); delete process.env.SME_TEST_IDENTITY; mocks.signOut.mockResolvedValue(undefined); mocks.middleware.mockResolvedValue(new Response(null, { status: 307, headers: { location: "https://app.test/auth/callback?locale=en&returnTo=%2Fen%2Fowner%2Ffixture", "set-cookie": "__Secure-neon-auth.session_token=fixture; Path=/" } })); });
afterEach(() => { delete process.env.SME_TEST_IDENTITY; vi.restoreAllMocks(); });
/** Local invalidation is carried by the failure redirect itself, never only by signOut(). */
function expectManagedCookiesExpired(response: Response) {
  const cookies = response.headers.getSetCookie();
  for (const name of MANAGED_AUTH_COOKIES) {
    expect(cookies.some((cookie) => cookie.startsWith(`${name}=;`) && /Max-Age=0/i.test(cookie))).toBe(true);
  }
}
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
  it("exchanges a verifier from a framework-wrapped request on Node 24 (regression for the production verifier_exchange failure)", async () => {
    // Next's compiled production route handler passes a Proxy wrapper around the
    // native Request, not the plain Request this file's `request()` helper
    // builds. On Node 24, `new NextRequest(wrappedRequest)` (a Request copy
    // construction) throws "Cannot read private member #state from an object
    // whose class did not declare it" because the wrapper hides Undici's
    // private fields from the copy constructor -- the same class of bug fixed
    // for a sibling route in b991b7f. This wraps a real Request in a
    // pass-through Proxy (matching that commit's own reproduction technique) to
    // exercise the exact production shape; before the fix, the outer try/catch
    // in route.ts would swallow the TypeError and redirect to
    // error=auth_unavailable with an "owner_sign_in_failed" verifier_exchange
    // log instead of completing.
    const original = request("locale=en&returnTo=%2Fen%2Fowner%2Ffixture&neon_auth_session_verifier=fixture");
    const wrapped = new Proxy(original, { get(target, property) { return Reflect.get(target, property, target); } });
    const response = await GET(wrapped);
    expect(response.headers.get("location")).toBe("https://app.test/en/owner/sign-in/complete?returnTo=%2Fen%2Fowner%2Ffixture");
    expect(mocks.middleware).toHaveBeenCalledOnce();
    const forwarded = mocks.middleware.mock.calls[0][0] as Request;
    expect(forwarded.url).toBe(original.url);
  });

  // Production 2026-10-11: a stale or reused magic link reaches this route as a
  // top-level navigation from the mail client, so the request carries the SDK
  // challenge cookie but no Origin header. Managed Auth's upstream sign-out is
  // a cookie-bearing POST, which better-auth's origin check rejects with 403
  // MISSING_OR_NULL_ORIGIN, so signOut() throws after it has already cleared
  // the local cookies. That throw used to escape into the catch-all, logging a
  // misleading verifier_exchange failure and telling the owner the service was
  // unavailable instead of that the link had expired.
  it("reports an expired link, not an outage, when a rejected verifier's best-effort sign-out fails upstream", async () => {
    mocks.middleware.mockResolvedValue(new Response(null, { status: 200, headers: { "x-middleware-next": "1" } }));
    mocks.signOut.mockRejectedValue(new Error("identity_signout_failed"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(request("locale=zh-HK&method=email&neon_auth_session_verifier=stale"));
    expect(response.headers.get("location")).toBe("https://app.test/zh-HK/owner/sign-in?method=email&error=invalid_code");
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expectManagedCookiesExpired(response);
    expect(JSON.stringify(spy.mock.calls)).not.toContain("verifier_exchange");
    spy.mockRestore();
  });
  it("reports an expired link, not an outage, when a provider token error's best-effort sign-out fails upstream", async () => {
    mocks.signOut.mockRejectedValue(new Error("identity_signout_failed"));
    const response = await GET(request("locale=en&claim=fixture-report&method=email&error=INVALID_TOKEN"));
    expect(response.headers.get("location")).toBe("https://app.test/en/owner/sign-in?claim=fixture-report&method=email&error=invalid_code");
    expectManagedCookiesExpired(response);
  });
  it("expires the managed cookies on the outage redirect too, whatever signOut reports", async () => {
    mocks.middleware.mockRejectedValue(new Error("private provider detail"));
    mocks.signOut.mockRejectedValue(new Error("identity_signout_failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(request("locale=en&method=email&neon_auth_session_verifier=fixture"));
    expect(response.headers.get("location")).toBe("https://app.test/en/owner/sign-in?method=email&error=auth_unavailable");
    expectManagedCookiesExpired(response);
  });
  it("fails closed when a fixture verifier exchange produces no response", async () => {
    process.env.SME_TEST_IDENTITY = "owned-local";
    mocks.exchangeFixtureVerifier.mockResolvedValue(null);
    const response = await GET(request("locale=en&method=google&neon_auth_session_verifier=fixture"));
    expect(response.headers.get("location")).toBe("https://app.test/en/owner/sign-in?method=google&error=invalid_code");
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});