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

  it("fails closed when a fixture verifier exchange produces no response", async () => {
    process.env.SME_TEST_IDENTITY = "owned-local";
    mocks.exchangeFixtureVerifier.mockResolvedValue(null);
    const response = await GET(request("locale=en&method=google&neon_auth_session_verifier=fixture"));
    expect(response.headers.get("location")).toBe("https://app.test/en/owner/sign-in?method=google&error=invalid_code");
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});