import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), map: vi.fn(), bind: vi.fn(), membership: vi.fn(), claim: vi.fn(), clear: vi.fn(), ports: vi.fn() }));
vi.mock("@neondatabase/auth/next/server", () => ({ createNeonAuth: () => ({ getSession: mocks.session }) }));
vi.mock("@/lib/identity/complete-sign-in-ports", () => ({ createCompletionPorts: mocks.ports }));

import { neonIdentityProvider } from "@/lib/identity/neon";
import { POST } from "./route";

const body = { locale: "en", method: "email", returnTo: "/en/owner/select-workspace" };
function request(input: object) {
  return new Request("https://app.test/api/owner/sign-in/complete", {
    method: "POST", headers: { origin: "https://app.test", "content-type": "application/json" }, body: JSON.stringify(input),
  });
}
function session(verified: unknown = true, expiresAt = new Date(Date.now() + 60_000)) {
  return { user: { id: "server-subject", email: "server@fixture.test", emailVerified: verified }, session: { userId: "server-subject", expiresAt } };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.fixture.test/auth"); vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "x".repeat(32));
  mocks.session.mockResolvedValue({ data: session(), error: null });
  mocks.map.mockResolvedValue({ id: "server-app-user", email: "server@fixture.test", verified: true });
  mocks.membership.mockResolvedValue(false);
  mocks.ports.mockResolvedValue({
    getIdentity: () => neonIdentityProvider.getIdentity(), mapIdentity: mocks.map, bindInvitations: mocks.bind,
    hasAcceptedMembership: mocks.membership, finishClaim: mocks.claim, clearInvalidSession: mocks.clear, reportFailure: vi.fn(),
  });
});
afterEach(() => { vi.unstubAllEnvs(); });

it.each(["email", "verifiedEmail", "userId", "role", "workspaceId"])("refuses a browser-supplied %s before resolving provider identity or workspace authority", async field => {
  const response = await POST(request({ ...body, [field]: "browser-assertion" }));
  expect(response.status).toBe(400);
  expect(mocks.ports).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.map).not.toHaveBeenCalled(); expect(mocks.bind).not.toHaveBeenCalled();
});

it.each([
  ["unverified", () => session(false)],
  ["string verification flag", () => session("true")],
  ["expired", () => session(true, new Date(0))],
  ["mismatched subject", () => ({ ...session(), session: { ...session().session, userId: "another-subject" } })],
])("rejects %s managed session metadata before identity mapping or membership binding", async (_name, build) => {
  mocks.session.mockResolvedValue({ data: build(), error: null });
  const response = await POST(request(body));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ kind: "recover", reason: "invalid_session" });
  expect(mocks.map).not.toHaveBeenCalled(); expect(mocks.bind).not.toHaveBeenCalled();
  expect(mocks.membership).not.toHaveBeenCalled(); expect(mocks.claim).not.toHaveBeenCalled();
});

it("uses only the freshly verified server identity and returns no access when it has no accepted membership", async () => {
  const response = await POST(request(body));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ kind: "no_access" });
  expect(mocks.map).toHaveBeenCalledExactlyOnceWith({ provider: "neon", subject: "server-subject", email: "server@fixture.test", verified: true });
  expect(mocks.bind).toHaveBeenCalledExactlyOnceWith({ id: "server-app-user", email: "server@fixture.test", verified: true });
  expect(mocks.membership).toHaveBeenCalledExactlyOnceWith("server-app-user");
  expect(mocks.claim).not.toHaveBeenCalled();
  expect(mocks.session).toHaveBeenCalledWith({ query: { disableCookieCache: "true" } });
});
