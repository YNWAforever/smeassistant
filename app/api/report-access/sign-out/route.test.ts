import { beforeEach, describe, expect, it, vi } from "vitest";
import { createViewerToken, hashViewerToken } from "@/lib/report-access/token";
import { MANAGED_AUTH_COOKIES } from "@/lib/identity/cookies";

const GRANT_ID = "22222222-2222-4222-8222-222222222222";
const mocks = vi.hoisted(() => ({ signOut: vi.fn(), revokeViewerGrant: vi.fn() }));
vi.mock("@/lib/auth", () => ({ signOut: mocks.signOut }));
vi.mock("@/lib/repositories/reports", () => ({ reportsRepository: () => ({ revokeViewerGrant: mocks.revokeViewerGrant }) }));
import { POST } from "./route";
const token = createViewerToken();
function request(cookie?: string): Request {
  return new Request("https://scanner.test/api/report-access/sign-out", { method: "POST", headers: cookie ? { cookie } : {} });
}
const validCookie = () => `sme_report_grant=${GRANT_ID}.${token.rawToken}`;
function expectCleared(response: Response) {
  const cookie = response.headers.get("set-cookie") ?? "";
  for (const name of ["sme_report_grant", ...MANAGED_AUTH_COOKIES]) expect(cookie).toContain(`${name}=`);
  expect(cookie).toMatch(/Max-Age=0/i);
}
describe("POST /api/report-access/sign-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.revokeViewerGrant.mockResolvedValue(undefined);
  });
  it("revokes through Neon with the presented grant id and hash, and clears all cookies", async () => {
    const response = await POST(request(validCookie()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.revokeViewerGrant).toHaveBeenCalledExactlyOnceWith(GRANT_ID, hashViewerToken(token.rawToken));
    expect(mocks.signOut).not.toHaveBeenCalled();
    expectCleared(response);
  });
  it.each([undefined, "sme_report_grant=garbage", "sme_report_grant=%zz"])("uniformly clears absent or malformed cookie %s without querying", async cookie => {
    const response = await POST(request(cookie));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.revokeViewerGrant).not.toHaveBeenCalled();
    expectCleared(response);
  });
  it("sanitizes grant persistence failure and still clears local cookies", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.revokeViewerGrant.mockRejectedValue(new Error("postgresql://private-secret"));
      const response = await POST(request(validCookie()));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(log).toHaveBeenCalledExactlyOnceWith("[report-access] sign-out revoke failed", { category: "grant_revoke_failed" });
      expectCleared(response);
    } finally { log.mockRestore(); }
  });
  it("also revokes a managed session when present", async () => {
    const response = await POST(request(`${validCookie()}; __Secure-neon-auth.session_token=fixture`));
    expect(response.status).toBe(200);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.revokeViewerGrant).toHaveBeenCalledTimes(1);
    expectCleared(response);
  });
  it("returns sanitized 503 for managed revocation failure while clearing all cookies", async () => {
    mocks.signOut.mockRejectedValue(new Error("private upstream"));
    const response = await POST(request(`${validCookie()}; __Secure-neon-auth.session_token=fixture`));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "auth_unavailable", correlationId: expect.any(String) });
    expect(mocks.revokeViewerGrant).toHaveBeenCalledTimes(1);
    expectCleared(response);
  });
});
