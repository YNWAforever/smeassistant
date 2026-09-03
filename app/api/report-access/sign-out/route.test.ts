import { beforeEach, describe, expect, it, vi } from "vitest";
import { createViewerToken, hashViewerToken } from "@/lib/report-access/token";
import { authorizeReport, type ViewerGrantRecord } from "@/lib/report-access/authorize-report";

const GRANT_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn(), filters: [] as Array<[string, unknown]> }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => ({ from: mocks.from }) }));

import { POST } from "./route";

const token = createViewerToken();

function request(cookie?: string): Request {
  return new Request("https://scanner.test/api/report-access/sign-out", {
    method: "POST",
    headers: cookie ? { cookie } : {},
  });
}

function validCookie(): string {
  return `sme_report_grant=${GRANT_ID}.${token.rawToken}`;
}

describe("POST /api/report-access/sign-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.filters = [];
    mocks.update.mockImplementation((payload: Record<string, unknown>) => {
      mocks.filters.push(["payload", payload]);
      const chain = {
        eq: (column: string, value: unknown) => { mocks.filters.push([column, value]); return chain; },
        is: async (column: string, value: unknown) => { mocks.filters.push([column, value]); return { error: null }; },
      };
      return chain;
    });
    mocks.from.mockImplementation(() => ({ update: mocks.update }));
  });

  it("clears the viewer cookie", async () => {
    const response = await POST(request(validCookie()));
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("sme_report_grant=");
    expect(setCookie).toMatch(/Max-Age=0/i);
  });

  it("revokes the grant, not just the cookie", async () => {
    await POST(request(validCookie()));
    const payload = mocks.filters.find(([key]) => key === "payload")?.[1] as Record<string, unknown>;
    expect(payload.revoked_at).toEqual(expect.any(String));
  });

  it("matches the token hash, so a stranger cannot revoke someone else's session", async () => {
    await POST(request(validCookie()));
    expect(mocks.filters).toContainEqual(["id", GRANT_ID]);
    expect(mocks.filters).toContainEqual(["token_hash", hashViewerToken(token.rawToken)]);
  });

  it("leaves the same token unable to authorize afterwards", async () => {
    await POST(request(validCookie()));
    const revokedAt = (mocks.filters.find(([key]) => key === "payload")?.[1] as Record<string, unknown>).revoked_at as string;

    // Replay the grant as the database would now return it. Clearing a cookie is
    // theatre on its own: the assertion that matters is that the captured token
    // no longer opens the report.
    const grant: ViewerGrantRecord = {
      id: GRANT_ID,
      job_id: JOB_ID,
      token_hash: hashViewerToken(token.rawToken),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      redeemed_at: null,
      revoked_at: revokedAt,
      last_used_at: null,
    };
    const access = await authorizeReport({
      job: { id: JOB_ID },
      viewerToken: { grantId: GRANT_ID, rawToken: token.rawToken },
      staffUser: null,
      lookupGrant: async () => grant,
    });
    expect(access).toEqual({ kind: "public" });
  });

  it("answers 200 with no cookie at all, without querying", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("answers 200 on a malformed cookie, without querying", async () => {
    const response = await POST(request("sme_report_grant=garbage"));
    expect(response.status).toBe(200);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("survives a malformed percent-escape in the cookie", async () => {
    // decodeURIComponent throws URIError on "%zz", and the cookie header is
    // attacker-controlled. An unhandled throw would turn a junk cookie into a 500
    // on a route whose whole job is to always succeed.
    const response = await POST(request("sme_report_grant=%zz"));
    expect(response.status).toBe(200);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("still signs the device out when the revoke write fails", async () => {
    mocks.update.mockImplementation(() => {
      const chain = { eq: () => chain, is: async () => ({ error: { message: "down" } }) };
      return chain;
    });
    const response = await POST(request(validCookie()));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie") ?? "").toMatch(/Max-Age=0/i);
  });
});
