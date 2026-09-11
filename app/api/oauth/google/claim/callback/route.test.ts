import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  verifyClaimState: vi.fn(),
  exchangeCode: vi.fn(),
  listManagedPlaceIds: vi.fn(),
  encryptToken: vi.fn((plaintext: string) => `encrypted:${plaintext}`),
  findOwnedWorkspace: vi.fn(),
  createWorkspaceWithOwner: vi.fn(),
  attachJobToWorkspace: vi.fn(),
  claimViaOAuthEnabled: vi.fn(() => true),
  jobById: vi.fn(),
  replaceGoogleConnection: vi.fn(),
  recordMerchantClaimEvent: vi.fn(),
  recordClaimAuditEvent: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({getUser:async()=>{const response=await mocks.getUser();const user=response?.data?.user;return user?{...user,verified:true}:null;}}));
vi.mock("@/lib/repositories/claims",()=>({
 recordClaimAuditEvent:mocks.recordClaimAuditEvent,
 claimsRepository:{
  jobById:mocks.jobById,
  recordMerchantClaimEvent:mocks.recordMerchantClaimEvent,
  replaceGoogleConnection:mocks.replaceGoogleConnection,
 },
}));
vi.mock("@/lib/oauth/claim-flow-flag", () => ({ claimViaOAuthEnabled: mocks.claimViaOAuthEnabled }));
vi.mock("@/lib/oauth/google-connection", () => ({
  GBP_SCOPE_REQUIRED: "https://www.googleapis.com/auth/business.manage",
  verifyClaimState: mocks.verifyClaimState,
  exchangeCode: mocks.exchangeCode,
}));
vi.mock("@/lib/oauth/google-business-profile", () => ({
  listManagedPlaceIds: mocks.listManagedPlaceIds,
}));
vi.mock("@/lib/security/token-crypto", () => ({ encryptToken: mocks.encryptToken }));
vi.mock("@/lib/workspace/callback-queries", () => ({
  findOwnedWorkspace: mocks.findOwnedWorkspace,
  createWorkspaceWithOwner: mocks.createWorkspaceWithOwner,
  attachJobToWorkspace: mocks.attachJobToWorkspace,
}));

import { GET } from "./route";

function request(query: string): Request {
  return new Request(`https://scanner.test/api/oauth/google/claim/callback${query}`);
}

const TOKENS = {
  accessToken: "access-token-1",
  refreshToken: "refresh-token-1",
  expiresAt: "2026-09-01T00:00:00.000Z",
  scopes: ["https://www.googleapis.com/auth/business.manage"],
};

// userId matches the signed-in user these tests mock, i.e. the ordinary case:
// the person finishing the claim is the person who started it.
const CLAIM_PAYLOAD = { jobId: "job-1", placeId: "place-a", slug: "abc123", userId: "user-1", nonce: "n", issuedAt: Date.now(), locale: "en" };

interface JobRow {
  id: string;
  business_name: string | null;
  industry: string | null;
  district: string | null;
  region: string | null;
}

const JOB_ROW: JobRow = { id: "job-1", business_name: "Demo Cafe", industry: "fnb", district: "Central", region: "hk" };

/** Configures repository outcomes for the callback's persistence boundaries. */
function mockHappyPathTables(overrides?: {
  replacementError?: Error;
  claimEventError?: { message: string } | null;
  auditEventError?: { message: string } | null;
  jobRow?: JobRow | null;
}) {
  const jobRow = overrides && "jobRow" in overrides ? overrides.jobRow : JOB_ROW;
  mocks.jobById.mockResolvedValue(jobRow);
  if (overrides?.replacementError) mocks.replaceGoogleConnection.mockRejectedValue(overrides.replacementError);
  else mocks.replaceGoogleConnection.mockResolvedValue("conn-1");
  mocks.recordMerchantClaimEvent.mockResolvedValue(overrides?.claimEventError ? false : true);
  mocks.recordClaimAuditEvent.mockResolvedValue(overrides?.auditEventError ? false : true);
}
function claimParam(response: Response): string | null {
  return new URL(response.headers.get("location")!).searchParams.get("claim");
}

function redirectPath(response: Response): string {
  return new URL(response.headers.get("location")!).pathname;
}

describe("GET /api/oauth/google/claim/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.encryptToken.mockImplementation((plaintext: string) => `encrypted:${plaintext}`);
    mocks.claimViaOAuthEnabled.mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects to a generic destination when the kill switch is off, before the state is even parsed -- flag off wins over every other input, including a valid signed state", async () => {
    // Pins that the flag gate runs before verifyClaimState: even a state that
    // WOULD verify successfully must not matter while the flag is off. This
    // route's URL is not secret, so the flag has to gate the route itself, not
    // merely the UI card that links to it.
    mocks.claimViaOAuthEnabled.mockReturnValue(false);
    mocks.verifyClaimState.mockReturnValue(CLAIM_PAYLOAD);

    const response = await GET(request("?code=abc&state=good"));

    expect(response.status).toBe(307);
    expect(claimParam(response)).toBe("unavailable");
    // No slug (or locale) available yet (the flag check runs before state is
    // parsed), so this falls back to the default-locale workspace picker.
    expect(redirectPath(response)).toBe("/zh-HK/owner/select-workspace");
    expect(mocks.verifyClaimState).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
  });

  it("exchanges the code against the claim flow's own redirect uri, not the connect flow's", async () => {
    // Both start routes call the same buildConsentUrl/exchangeCode pair, so
    // without an explicit redirect uri here the claim callback would send
    // Google's token endpoint GOOGLE_OAUTH_REDIRECT_URI -- a mismatch against
    // the uri actually used to obtain `code` at the claim start route, since
    // Google requires the two to byte-match.
    vi.stubEnv("GOOGLE_OAUTH_CLAIM_REDIRECT_URI", "https://scanner.test/api/oauth/google/claim/callback");
    mocks.verifyClaimState.mockReturnValue(CLAIM_PAYLOAD);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    mocks.exchangeCode.mockResolvedValue(TOKENS);
    mocks.listManagedPlaceIds.mockResolvedValue([{ placeId: "place-a", locationName: "locations/aaa" }]);
    mocks.findOwnedWorkspace.mockResolvedValue({ data: null, error: null });
    mocks.createWorkspaceWithOwner.mockResolvedValue({ id: "ws-new", slug: "demo-cafe" });
    mocks.attachJobToWorkspace.mockResolvedValue(true);
    mockHappyPathTables();

    await GET(request("?code=abc&state=good"));

    expect(mocks.exchangeCode).toHaveBeenCalledWith("abc", "https://scanner.test/api/oauth/google/claim/callback");
  });

  it("redirects declined consent back to the locale-prefixed report using the slug recovered from the echoed state", async () => {
    // Google echoes the original `state` parameter back on an error redirect
    // too, not only on success, so a decline still carries a verifiable state
    // and therefore a slug (and locale) to redirect back to.
    mocks.verifyClaimState.mockReturnValue(CLAIM_PAYLOAD);
    const response = await GET(request("?error=access_denied&state=good"));
    expect(response.status).toBe(307);
    expect(claimParam(response)).toBe("declined");
    expect(redirectPath(response)).toBe("/en/r/abc123");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
  });

  it("falls back to a generic destination for a decline with no recoverable state", async () => {
    const response = await GET(request("?error=access_denied"));
    expect(response.status).toBe(307);
    expect(claimParam(response)).toBe("declined");
    expect(redirectPath(response)).toBe("/zh-HK/owner/select-workspace");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
  });

  it("rejects a state signature that does not verify, falling back to a generic destination since there is no slug to recover", async () => {
    mocks.verifyClaimState.mockReturnValue(null);
    const response = await GET(request("?code=abc&state=bad"));
    expect(claimParam(response)).toBe("invalid_state");
    expect(redirectPath(response)).toBe("/zh-HK/owner/select-workspace");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("falls back to a generic destination rather than interpolating a malformed slug into the redirect", async () => {
    // Not reachable via any caller today (claim/start/route.ts validates the
    // slug with the same regex before ever signing it), but signClaimState's
    // own type only checks `typeof slug === "string"` -- a future caller that
    // skips validation must not turn back() into an open redirect.
    mocks.verifyClaimState.mockReturnValue({ ...CLAIM_PAYLOAD, slug: "../../evil" });
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await GET(request("?code=abc&state=good"));
    expect(claimParam(response)).toBe("unauthenticated");
    expect(redirectPath(response)).toBe("/en/owner/select-workspace");
  });

  it("refuses a state redeemed inside a different user's session, before touching Google", async () => {
    // The attack this closes: an attacker who genuinely manages a GBP location
    // starts a claim for their own scan, captures Google's redirect without
    // following it, and gets a signed-in victim to open the code+state URL.
    // The state proves Google attested to the place -- it never proved who
    // began the flow. Redeemed in the victim's session it attached the
    // attacker's job to the VICTIM's workspace (attachJob is write-once, with
    // no detach path anywhere) and replaced their Google connection.
    mocks.verifyClaimState.mockReturnValue({ ...CLAIM_PAYLOAD, userId: "attacker-1" });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "victim@example.com" } } });

    const response = await GET(request("?code=abc&state=good"));

    expect(claimParam(response)).toBe("session_mismatch");
    // Nothing is spent and nothing is written -- the check sits before the
    // exchange, so the authorization code is not burned either.
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
    expect(mocks.createWorkspaceWithOwner).not.toHaveBeenCalled();
    expect(mocks.attachJobToWorkspace).not.toHaveBeenCalled();
    expect(mocks.replaceGoogleConnection).not.toHaveBeenCalled();
  });

  it("uses the default locale when the state carries an unsupported one", async () => {
    mocks.verifyClaimState.mockReturnValue({ ...CLAIM_PAYLOAD, locale: "fr" });
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await GET(request("?code=abc&state=good"));
    expect(redirectPath(response)).toBe("/zh-HK/r/abc123");
  });

  it("refuses an unauthenticated caller, redirecting back to the report", async () => {
    mocks.verifyClaimState.mockReturnValue(CLAIM_PAYLOAD);
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await GET(request("?code=abc&state=good"));
    expect(claimParam(response)).toBe("unauthenticated");
    expect(redirectPath(response)).toBe("/en/r/abc123");
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
  });

  it("leaks no provider text when the code exchange fails", async () => {
    mocks.verifyClaimState.mockReturnValue(CLAIM_PAYLOAD);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    mocks.exchangeCode.mockResolvedValue(null);
    const response = await GET(request("?code=abc&state=good"));
    const location = response.headers.get("location")!;
    expect(claimParam(response)).toBe("exchange_failed");
    expect(redirectPath(response)).toBe("/en/r/abc123");
    expect(`${await response.text()}${location}`).not.toMatch(/client_secret|googleapis/i);
  });

  it("refuses consent that returned no refresh token, without calling the Business Profile API", async () => {
    // Mutation guard: if the no-refresh-token check were dropped, this would
    // sail through to listManagedPlaceIds and beyond using a token that can
    // never be refreshed once it expires.
    mocks.verifyClaimState.mockReturnValue(CLAIM_PAYLOAD);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    mocks.exchangeCode.mockResolvedValue({ ...TOKENS, refreshToken: null });
    const response = await GET(request("?code=abc&state=good"));
    expect(claimParam(response)).toBe("no_refresh_token");
    expect(mocks.listManagedPlaceIds).not.toHaveBeenCalled();
  });

  it("refuses consent that omitted the business.manage scope, without calling the Business Profile API", async () => {
    mocks.verifyClaimState.mockReturnValue(CLAIM_PAYLOAD);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    mocks.exchangeCode.mockResolvedValue({ ...TOKENS, scopes: [] });
    const response = await GET(request("?code=abc&state=good"));
    expect(claimParam(response)).toBe("missing_scope");
    expect(mocks.listManagedPlaceIds).not.toHaveBeenCalled();
  });

  it("refuses when the connected account manages a different business, and creates nothing", async () => {
    // Mutation guard: repository boundaries stay untouched before the provider ownership match.
    mocks.verifyClaimState.mockReturnValue(CLAIM_PAYLOAD);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    mocks.exchangeCode.mockResolvedValue(TOKENS);
    mocks.listManagedPlaceIds.mockResolvedValue([{ placeId: "place-b", locationName: "locations/bbb" }]);

    const response = await GET(request("?code=abc&state=good"));

    expect(claimParam(response)).toBe("place_not_managed");
    expect(redirectPath(response)).toBe("/en/r/abc123");
    expect(mocks.createWorkspaceWithOwner).not.toHaveBeenCalled();
    expect(mocks.attachJobToWorkspace).not.toHaveBeenCalled();
    expect(mocks.jobById).not.toHaveBeenCalled();
  });

  it("verifies a match, creates the workspace, attaches the job, records both events and continues onboarding", async () => {
    mocks.verifyClaimState.mockReturnValue(CLAIM_PAYLOAD);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    mocks.exchangeCode.mockResolvedValue(TOKENS);
    mocks.listManagedPlaceIds.mockResolvedValue([
      { placeId: "place-a", locationName: "locations/aaa" },
      { placeId: "place-b", locationName: "locations/bbb" },
    ]);
    mocks.findOwnedWorkspace.mockResolvedValue({ data: null, error: null });
    mocks.createWorkspaceWithOwner.mockResolvedValue({ id: "ws-new", slug: "demo-cafe" });
    mocks.attachJobToWorkspace.mockResolvedValue(true);

    mockHappyPathTables();

    const response = await GET(request("?code=abc&state=good"));

    // Success continues the onboarding flow for this claim (CONTRACT.md):
    // `/{locale}/owner/onboarding?claim=<slug>`, never a bare dashboard the
    // merchant has no link back from. No flow-state parameter is passed --
    // onboarding derives its resume step from the ownership just persisted, so
    // losing the parameter cannot send the owner back to step 1.
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/en/owner/onboarding");
    expect(location.searchParams.get("claim")).toBe("abc123");
    expect(location.searchParams.get("claimed")).toBeNull();
    expect(mocks.createWorkspaceWithOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: "user-1",
        ownerEmail: "owner@example.com",
        businessName: "Demo Cafe",
      }),
    );
    expect(mocks.attachJobToWorkspace).toHaveBeenCalledWith("job-1", "ws-new");
    expect(mocks.replaceGoogleConnection).toHaveBeenCalledWith({
      workspaceId: "ws-new",
      accountRef: "locations/aaa",
      accessTokenEncrypted: "encrypted:access-token-1",
      refreshTokenEncrypted: "encrypted:refresh-token-1",
      scopes: TOKENS.scopes,
      expiresAt: TOKENS.expiresAt,
    });
    expect(mocks.recordMerchantClaimEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: "job-1",
        workspace_id: "ws-new",
        matched_location_id: "locations/aaa",
        claimed_by_user_id: "user-1",
      }),
    );
    expect(mocks.recordClaimAuditEvent).toHaveBeenCalledWith({
      workspace_id: "ws-new",
      actor_type: "user",
      actor_id: "user-1",
      event: "workspace.claimed",
      entity_type: "audit_job",
      entity_id: "job-1",
      payload: { locale: "en" },
    });
  });

  it("reuses an existing owned workspace instead of creating a second one", async () => {
    // Mutation guard: if findOwnedWorkspace's result were ignored and
    // createWorkspaceWithOwner called unconditionally, this would fail.
    mocks.verifyClaimState.mockReturnValue(CLAIM_PAYLOAD);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    mocks.exchangeCode.mockResolvedValue(TOKENS);
    mocks.listManagedPlaceIds.mockResolvedValue([{ placeId: "place-a", locationName: "locations/aaa" }]);
    mocks.findOwnedWorkspace.mockResolvedValue({ data: { workspaceId: "ws-existing" }, error: null });
    mocks.attachJobToWorkspace.mockResolvedValue(true);

    mockHappyPathTables();

    const response = await GET(request("?code=abc&state=good"));

    expect(redirectPath(response)).toBe("/en/owner/onboarding");
    expect(mocks.createWorkspaceWithOwner).not.toHaveBeenCalled();
    expect(mocks.attachJobToWorkspace).toHaveBeenCalledWith("job-1", "ws-existing");
  });

  it("returns not_found when the job row backing the claim state no longer exists", async () => {
    mocks.verifyClaimState.mockReturnValue(CLAIM_PAYLOAD);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    mocks.exchangeCode.mockResolvedValue(TOKENS);
    mocks.listManagedPlaceIds.mockResolvedValue([{ placeId: "place-a", locationName: "locations/aaa" }]);

    mockHappyPathTables({ jobRow: null });

    const response = await GET(request("?code=abc&state=good"));
    expect(claimParam(response)).toBe("not_found");
    expect(mocks.createWorkspaceWithOwner).not.toHaveBeenCalled();
    expect(mocks.attachJobToWorkspace).not.toHaveBeenCalled();
  });

  it("refuses a job that was claimed by someone else between start and callback", async () => {
    mocks.verifyClaimState.mockReturnValue(CLAIM_PAYLOAD);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    mocks.exchangeCode.mockResolvedValue(TOKENS);
    mocks.listManagedPlaceIds.mockResolvedValue([{ placeId: "place-a", locationName: "locations/aaa" }]);
    mocks.findOwnedWorkspace.mockResolvedValue({ data: null, error: null });
    mocks.createWorkspaceWithOwner.mockResolvedValue({ id: "ws-new", slug: "demo-cafe" });
    mocks.attachJobToWorkspace.mockResolvedValue(false);

    mockHappyPathTables({
      jobRow: { id: "job-1", business_name: "Demo Cafe", industry: null, district: null, region: "hk" },
    });

    const response = await GET(request("?code=abc&state=good"));
    expect(claimParam(response)).toBe("already_claimed");
    // The lost race must stop before any oauth_connections row or audit event
    // is written for a workspace this caller no longer has a claim on.
    expect(mocks.replaceGoogleConnection).not.toHaveBeenCalled();
    expect(mocks.recordMerchantClaimEvent).not.toHaveBeenCalled();
  });

  it("returns storage_failed when the repository rejects connection replacement without recording a claim event", async () => {
    mocks.verifyClaimState.mockReturnValue(CLAIM_PAYLOAD);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    mocks.exchangeCode.mockResolvedValue(TOKENS);
    mocks.listManagedPlaceIds.mockResolvedValue([{ placeId: "place-a", locationName: "locations/aaa" }]);
    mocks.findOwnedWorkspace.mockResolvedValue({ data: null, error: null });
    mocks.createWorkspaceWithOwner.mockResolvedValue({ id: "ws-new", slug: "demo-cafe" });
    mocks.attachJobToWorkspace.mockResolvedValue(true);
    mockHappyPathTables({ replacementError: new Error("replace failed") });

    const response = await GET(request("?code=abc&state=good"));

    expect(claimParam(response)).toBe("storage_failed");
    expect(mocks.recordMerchantClaimEvent).not.toHaveBeenCalled();
    expect(mocks.recordClaimAuditEvent).not.toHaveBeenCalled();
  });
  it("still reports success when the best-effort claim-event or audit-event insert fails", async () => {
    // A failed audit-log write must never turn an otherwise-successful claim
    // into an error shown to the owner (repo convention for best-effort ops).
    mocks.verifyClaimState.mockReturnValue(CLAIM_PAYLOAD);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    mocks.exchangeCode.mockResolvedValue(TOKENS);
    mocks.listManagedPlaceIds.mockResolvedValue([{ placeId: "place-a", locationName: "locations/aaa" }]);
    mocks.findOwnedWorkspace.mockResolvedValue({ data: null, error: null });
    mocks.createWorkspaceWithOwner.mockResolvedValue({ id: "ws-new", slug: "demo-cafe" });
    mocks.attachJobToWorkspace.mockResolvedValue(true);

    mockHappyPathTables({ claimEventError: { message: "event insert failed" }, auditEventError: { message: "audit failed" } });

    const response = await GET(request("?code=abc&state=good"));
    expect(redirectPath(response)).toBe("/en/owner/onboarding");
    expect(new URL(response.headers.get("location")!).searchParams.get("claim")).toBe("abc123");
  });

  it("never leaks the access token in the redirect or the response body", async () => {
    mocks.verifyClaimState.mockReturnValue(CLAIM_PAYLOAD);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    mocks.exchangeCode.mockResolvedValue(TOKENS);
    mocks.listManagedPlaceIds.mockRejectedValue(new Error("business_profile_accounts_failed"));

    const response = await GET(request("?code=abc&state=good"));
    const location = response.headers.get("location")!;
    expect(claimParam(response)).toBe("verification_failed");
    expect(`${await response.text()}${location}`).not.toContain(TOKENS.accessToken);
  });
});
