import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  buildConsentUrl: vi.fn((state: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`),
  signClaimState: vi.fn(() => "signed-claim-state"),
  googleOAuthClaimConfigured: vi.fn(() => true),
  claimViaOAuthEnabled: vi.fn(() => true),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => ({ from: mocks.from }) }));
vi.mock("@/lib/oauth/claim-flow-flag", () => ({ claimViaOAuthEnabled: mocks.claimViaOAuthEnabled }));
vi.mock("@/lib/oauth/google-connection", () => ({
  buildConsentUrl: mocks.buildConsentUrl,
  signClaimState: mocks.signClaimState,
  googleOAuthClaimConfigured: mocks.googleOAuthClaimConfigured,
}));

import { GET } from "./route";

function request(query: string): Request {
  return new Request(`https://scanner.test/api/oauth/google/claim/start${query}`);
}

/** Pins the table name and the exact `eq` filter, not just the returned data. */
function mockAuditJobsRow(row: { id: string; place_id: string | null; workspace_id: string | null } | null) {
  const eq = vi.fn((_column: string, _value: string) => ({
    maybeSingle: async () => ({ data: row, error: null }),
  }));
  mocks.from.mockImplementation((table: string) => {
    if (table === "audit_jobs") return { select: () => ({ eq }) };
    throw new Error(`unexpected table ${table}`);
  });
  return eq;
}

/** Same shape, but the query itself failed rather than simply finding no row. */
function mockAuditJobsQueryError(dbError: { message: string }) {
  mocks.from.mockImplementation((table: string) => {
    if (table === "audit_jobs") {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: dbError }) }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("GET /api/oauth/google/claim/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.googleOAuthClaimConfigured.mockReturnValue(true);
    mocks.claimViaOAuthEnabled.mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("404s when the kill switch is off, before the config check, slug validation, or Supabase -- flag off wins over every other input", async () => {
    // Pins that the flag gate is the very first check in the route, ahead of
    // googleOAuthClaimConfigured() and the slug regex -- both of which would
    // otherwise happily proceed on this well-formed request. A disabled flag
    // must 404 the route directly, not merely hide the UI link that points at
    // it: this URL is not secret.
    mocks.claimViaOAuthEnabled.mockReturnValue(false);
    mocks.googleOAuthClaimConfigured.mockReturnValue(true);
    const response = await GET(request("?slug=abc123"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
    expect(mocks.googleOAuthClaimConfigured).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("503s when the claim OAuth flow is not configured, without touching Supabase", async () => {
    // Covers both googleOAuthConfigured() being false (base connect config
    // missing) and it being true but GOOGLE_OAUTH_CLAIM_REDIRECT_URI unset --
    // googleOAuthClaimConfigured() folds both into one gate.
    mocks.googleOAuthClaimConfigured.mockReturnValue(false);
    const response = await GET(request("?slug=abc123"));
    expect(response.status).toBe(503);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("400s a missing slug before touching Supabase", async () => {
    const response = await GET(request(""));
    expect(response.status).toBe(400);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("400s a malformed slug before touching Supabase", async () => {
    // Deleting the SLUG_RE check (leaving only a truthiness check) would still
    // pass every other test here, since they only ever pass either no slug or
    // a well-formed one. This is the one test that actually exercises the
    // regex's character-class and length bounds rather than just its
    // presence check.
    const response = await GET(request(`?slug=${encodeURIComponent("has spaces")}`));
    expect(response.status).toBe(400);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("400s a too-short slug", async () => {
    const response = await GET(request("?slug=abc12"));
    expect(response.status).toBe(400);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("401s an unauthenticated visitor", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await GET(request("?slug=abc123"));
    expect(response.status).toBe(401);
  });

  it("404s a slug with no matching job", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const eq = mockAuditJobsRow(null);
    const response = await GET(request("?slug=no-such-slug"));
    expect(response.status).toBe(404);
    expect(eq).toHaveBeenCalledWith("share_slug", "no-such-slug");
  });

  it("logs a real DB error on the job lookup instead of silently reporting not_found", async () => {
    // maybeSingle() returning {data: null, error: <real error>} is a Postgres
    // failure, not "no such slug" -- those two cases must not be
    // indistinguishable in the logs the way they are in the client response.
    // Deleting the log call here (leaving only the existing !job -> 404
    // branch) would leave every other test in this file green.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockAuditJobsQueryError({ message: "connection refused to db.internal:5432" });

    const response = await GET(request("?slug=abc123"));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ error: "not_found" });
    expect(JSON.stringify(body)).not.toMatch(/db\.internal/);
    expect(consoleError).toHaveBeenCalledWith(
      "[oauth/google/claim/start] job lookup failed",
      expect.objectContaining({ message: "connection refused to db.internal:5432" }),
    );
    consoleError.mockRestore();
  });

  it("redirects to Google consent with claim-mode state for a signed-in user and a real job", async () => {
    vi.stubEnv("GOOGLE_OAUTH_CLAIM_REDIRECT_URI", "https://scanner.test/api/oauth/google/claim/callback");
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const eq = mockAuditJobsRow({ id: "job-1", place_id: "ChIJ_test", workspace_id: null });

    const response = await GET(request("?slug=abc123&locale=en"));

    expect(response.status).toBe(307);
    expect(eq).toHaveBeenCalledWith("share_slug", "abc123");
    // The locale rides along in the signed state (smeassistant addition) so
    // the callback can redirect to /{locale}/…; the nonce keeps its default.
    expect(mocks.signClaimState).toHaveBeenCalledWith("job-1", "ChIJ_test", "abc123", undefined, "en");
    // Pins that the redirect target is actually built from signClaimState's
    // return value, not some other in-scope string that also happens to
    // contain "accounts.google.com" -- and that it uses the claim flow's OWN
    // redirect uri, not the connect flow's GOOGLE_OAUTH_REDIRECT_URI. Sending
    // Google back to the connect callback would run verifyState (not
    // verifyClaimState) on this claim-domain state and fail invalid_state.
    expect(mocks.buildConsentUrl).toHaveBeenCalledWith(
      "signed-claim-state",
      "https://scanner.test/api/oauth/google/claim/callback",
    );
    expect(response.headers.get("location")).toContain("accounts.google.com");
    expect(response.headers.get("location")).toContain("state=signed-claim-state");
  });

  it("falls back to the default locale when none (or an unsupported one) is requested", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockAuditJobsRow({ id: "job-1", place_id: "ChIJ_test", workspace_id: null });

    await GET(request("?slug=abc123"));
    expect(mocks.signClaimState).toHaveBeenLastCalledWith("job-1", "ChIJ_test", "abc123", undefined, "zh-HK");

    await GET(request("?slug=abc123&locale=fr"));
    expect(mocks.signClaimState).toHaveBeenLastCalledWith("job-1", "ChIJ_test", "abc123", undefined, "zh-HK");
  });

  it("refuses a job with no place_id on it -- there is nothing to verify against", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockAuditJobsRow({ id: "job-1", place_id: null, workspace_id: null });
    const response = await GET(request("?slug=abc123"));
    expect(response.status).toBe(422);
    expect(mocks.signClaimState).not.toHaveBeenCalled();
  });

  it("refuses a job that is already claimed", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockAuditJobsRow({ id: "job-1", place_id: "ChIJ_test", workspace_id: "ws-existing" });
    const response = await GET(request("?slug=abc123"));
    expect(response.status).toBe(409);
    expect(mocks.signClaimState).not.toHaveBeenCalled();
  });

  it("500s without leaking the underlying error when Supabase throws unexpectedly", async () => {
    mocks.getUser.mockRejectedValue(new Error("connection refused to db.internal:5432 with secret-token"));
    const response = await GET(request("?slug=abc123"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toMatch(/secret-token|db\.internal/);
  });
});
