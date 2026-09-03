import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  verifyClaimState: vi.fn(),
  exchangeCode: vi.fn(),
  listManagedPlaceIds: vi.fn(),
  encryptToken: vi.fn((plaintext: string) => `encrypted:${plaintext}`),
  findOwnedWorkspace: vi.fn(),
  createWorkspaceWithOwner: vi.fn(),
  attachJobToWorkspace: vi.fn(),
  claimViaOAuthEnabled: vi.fn(() => true),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => ({ from: mocks.from }) }));
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

const CLAIM_PAYLOAD = { jobId: "job-1", placeId: "place-a", slug: "abc123", nonce: "n", issuedAt: Date.now(), locale: "en" };

interface JobRow {
  id: string;
  business_name: string | null;
  industry: string | null;
  district: string | null;
  region: string | null;
}

const JOB_ROW: JobRow = { id: "job-1", business_name: "Demo Cafe", industry: "fnb", district: "Central", region: "hk" };

/** Wires audit_jobs / oauth_connections / workspace_claim_events / audit_events with all-success responses. */
function mockHappyPathTables(overrides?: {
  connectionInsertError?: { message: string } | null;
  revokeError?: { message: string } | null;
  promoteError?: { message: string } | null;
  claimEventError?: { message: string } | null;
  auditEventError?: { message: string } | null;
  jobRow?: JobRow | null;
}) {
  const jobRow = overrides && "jobRow" in overrides ? overrides.jobRow : JOB_ROW;
  const jobSelect = vi.fn(() => ({
    eq: () => ({
      maybeSingle: async () => ({ data: jobRow, error: null }),
    }),
  }));
  const insert = vi.fn(() => ({
    select: () => ({
      single: async () =>
        overrides?.connectionInsertError
          ? { data: null, error: overrides.connectionInsertError }
          : { data: { id: "conn-1" }, error: null },
    }),
  }));
  // Dispatches on the update payload's `status` rather than call order, so the
  // mock mirrors two distinct queries: revoke (workspace_id + provider + status
  // filters, three chained `.eq()`s) and promote (id + status filters, two
  // chained `.eq()`s) -- exactly like the connect-flow callback's real queries.
  const update = vi.fn((payload: { status: string }) => {
    if (payload.status === "revoked") {
      return {
        eq: () => ({
          eq: () => ({
            eq: async () => ({ error: overrides?.revokeError ?? null }),
          }),
        }),
      };
    }
    return {
      eq: () => ({
        eq: async () => ({ error: overrides?.promoteError ?? null }),
      }),
    };
  });
  const claimEventInsert = vi.fn(async () => ({ error: overrides?.claimEventError ?? null }));
  const auditEventInsert = vi.fn(async () => ({ error: overrides?.auditEventError ?? null }));
  mocks.from.mockImplementation((table: string) => {
    if (table === "audit_jobs") return { select: jobSelect };
    if (table === "oauth_connections") return { insert, update };
    if (table === "workspace_claim_events") return { insert: claimEventInsert };
    if (table === "audit_events") return { insert: auditEventInsert };
    throw new Error(`unexpected table ${table}`);
  });
  return { jobSelect, insert, update, claimEventInsert, auditEventInsert };
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
    // Mutation guard: this is what would fail if the place_id match check were
    // deleted and the route always proceeded to create+attach. mocks.from has
    // no implementation configured in this test, so any write path (or even
    // the read-only job lookup) throws and the test fails with "unavailable"
    // instead of the expected "place_not_managed".
    mocks.verifyClaimState.mockReturnValue(CLAIM_PAYLOAD);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    mocks.exchangeCode.mockResolvedValue(TOKENS);
    mocks.listManagedPlaceIds.mockResolvedValue([{ placeId: "place-b", locationName: "locations/bbb" }]);

    const response = await GET(request("?code=abc&state=good"));

    expect(claimParam(response)).toBe("place_not_managed");
    expect(redirectPath(response)).toBe("/en/r/abc123");
    expect(mocks.createWorkspaceWithOwner).not.toHaveBeenCalled();
    expect(mocks.attachJobToWorkspace).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
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

    const { insert, claimEventInsert, auditEventInsert } = mockHappyPathTables();

    const response = await GET(request("?code=abc&state=good"));

    // Success continues the onboarding flow for this claim (CONTRACT.md):
    // `/{locale}/owner/onboarding?claim=<slug>&claimed=1`, never a bare
    // dashboard the merchant has no link back from.
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/en/owner/onboarding");
    expect(location.searchParams.get("claim")).toBe("abc123");
    expect(location.searchParams.get("claimed")).toBe("1");
    expect(mocks.createWorkspaceWithOwner).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerUserId: "user-1",
        ownerEmail: "owner@example.com",
        businessName: "Demo Cafe",
      }),
    );
    expect(mocks.attachJobToWorkspace).toHaveBeenCalledWith(expect.anything(), "job-1", "ws-new");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "ws-new",
        provider: "google_gbp",
        account_ref: "locations/aaa",
        access_token_encrypted: "encrypted:access-token-1",
        refresh_token_encrypted: "encrypted:refresh-token-1",
      }),
    );
    expect(claimEventInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: "job-1",
        workspace_id: "ws-new",
        matched_location_id: "locations/aaa",
        claimed_by_user_id: "user-1",
      }),
    );
    expect(auditEventInsert).toHaveBeenCalledWith({
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
    expect(mocks.attachJobToWorkspace).toHaveBeenCalledWith(expect.anything(), "job-1", "ws-existing");
  });

  it("revokes an existing active google_gbp connection before promoting the new one, so a repeat claim on an already-connected workspace does not 23505 on oauth_connections_active_provider_key", async () => {
    // Regression test: the owner already connected Google once before (or is
    // claiming a second scan into the same workspace), so findOwnedWorkspace
    // returns an existing workspace that may already have an active
    // google_gbp row. Without a revoke step between insert and promote, the
    // promote update would collide with the partial unique index on
    // (workspace_id, provider) where status = 'active' -- and by then
    // attachJobToWorkspace has already run, so the job is stuck attached with
    // no way to retry (the start route would now say already_claimed).
    mocks.verifyClaimState.mockReturnValue(CLAIM_PAYLOAD);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    mocks.exchangeCode.mockResolvedValue(TOKENS);
    mocks.listManagedPlaceIds.mockResolvedValue([{ placeId: "place-a", locationName: "locations/aaa" }]);
    mocks.findOwnedWorkspace.mockResolvedValue({ data: { workspaceId: "ws-existing" }, error: null });
    mocks.attachJobToWorkspace.mockResolvedValue(true);

    const { update } = mockHappyPathTables();

    const response = await GET(request("?code=abc&state=good"));

    expect(redirectPath(response)).toBe("/en/owner/onboarding");
    const statuses = update.mock.calls.map(([payload]) => (payload as { status: string }).status);
    expect(statuses).toEqual(["revoked", "active"]);
  });

  it("returns storage_failed when revoking an existing active connection fails, without promoting or recording a claim event", async () => {
    mocks.verifyClaimState.mockReturnValue(CLAIM_PAYLOAD);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    mocks.exchangeCode.mockResolvedValue(TOKENS);
    mocks.listManagedPlaceIds.mockResolvedValue([{ placeId: "place-a", locationName: "locations/aaa" }]);
    mocks.findOwnedWorkspace.mockResolvedValue({ data: { workspaceId: "ws-existing" }, error: null });
    mocks.attachJobToWorkspace.mockResolvedValue(true);

    const { update, claimEventInsert, auditEventInsert } = mockHappyPathTables({ revokeError: { message: "revoke failed" } });

    const response = await GET(request("?code=abc&state=good"));

    expect(claimParam(response)).toBe("storage_failed");
    const statuses = update.mock.calls.map(([payload]) => (payload as { status: string }).status);
    expect(statuses).toEqual(["revoked"]);
    expect(claimEventInsert).not.toHaveBeenCalled();
    expect(auditEventInsert).not.toHaveBeenCalled();
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

    const { insert, update, claimEventInsert } = mockHappyPathTables({
      jobRow: { id: "job-1", business_name: "Demo Cafe", industry: null, district: null, region: "hk" },
    });

    const response = await GET(request("?code=abc&state=good"));
    expect(claimParam(response)).toBe("already_claimed");
    // The lost race must stop before any oauth_connections row or audit event
    // is written for a workspace this caller no longer has a claim on.
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(claimEventInsert).not.toHaveBeenCalled();
  });

  it("returns storage_failed when the oauth_connections insert fails, without recording a claim event", async () => {
    mocks.verifyClaimState.mockReturnValue(CLAIM_PAYLOAD);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    mocks.exchangeCode.mockResolvedValue(TOKENS);
    mocks.listManagedPlaceIds.mockResolvedValue([{ placeId: "place-a", locationName: "locations/aaa" }]);
    mocks.findOwnedWorkspace.mockResolvedValue({ data: null, error: null });
    mocks.createWorkspaceWithOwner.mockResolvedValue({ id: "ws-new", slug: "demo-cafe" });
    mocks.attachJobToWorkspace.mockResolvedValue(true);

    const { claimEventInsert } = mockHappyPathTables({ connectionInsertError: { message: "insert failed" } });

    const response = await GET(request("?code=abc&state=good"));
    expect(claimParam(response)).toBe("storage_failed");
    expect(claimEventInsert).not.toHaveBeenCalled();
  });

  it("returns storage_failed when promoting the connection to active fails", async () => {
    mocks.verifyClaimState.mockReturnValue(CLAIM_PAYLOAD);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    mocks.exchangeCode.mockResolvedValue(TOKENS);
    mocks.listManagedPlaceIds.mockResolvedValue([{ placeId: "place-a", locationName: "locations/aaa" }]);
    mocks.findOwnedWorkspace.mockResolvedValue({ data: null, error: null });
    mocks.createWorkspaceWithOwner.mockResolvedValue({ id: "ws-new", slug: "demo-cafe" });
    mocks.attachJobToWorkspace.mockResolvedValue(true);

    const { claimEventInsert } = mockHappyPathTables({ promoteError: { message: "promote failed" } });

    const response = await GET(request("?code=abc&state=good"));
    expect(claimParam(response)).toBe("storage_failed");
    expect(claimEventInsert).not.toHaveBeenCalled();
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
    expect(new URL(response.headers.get("location")!).searchParams.get("claimed")).toBe("1");
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
