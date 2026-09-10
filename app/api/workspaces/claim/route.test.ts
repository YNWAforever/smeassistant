import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  legacy: vi.fn(),
  derive: vi.fn(async () => undefined),
  snapshotRepo: { marker: "neon" },
  buildSnapshot: vi.fn(async () => undefined),
  completeWorkspaceClaim: vi.fn(),
  enforceRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 1 })),
}));

vi.mock("@/lib/repositories/action-derivation", () => ({ deriveActionsForClaim: mocks.derive }));
vi.mock("@/lib/repositories/snapshots", () => ({ snapshotRepository: () => mocks.snapshotRepo }));
vi.mock("@/lib/workspace/snapshots", () => ({ buildSnapshot: mocks.buildSnapshot, loadSnapshotForJob: vi.fn(async () => null) }));
vi.mock("@/lib/auth", () => ({ getUser: mocks.getUser }));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/security/rate-limit")>();
  return { ...original, enforceRateLimit: mocks.enforceRateLimit };
});
vi.mock("@/lib/workspace/claim", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/workspace/claim")>();
  return { ...original, completeWorkspaceClaim: mocks.completeWorkspaceClaim };
});

import { POST } from "./route";
import { parseClaimBody } from "./parse-body";

const USER = { id: "user-1", email: "owner@example.com", verified: true };

const BODY = {
  claim_slug: "abc123",
  workspace_name: "Kam Man House",
  primary_location: { name: "Tin Hau", address: "12 Electric Road" },
  market: "hk",
  timezone: "Asia/Hong_Kong",
  locale: "zh-HK",
};

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("https://app.test/api/workspaces/claim", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/workspaces/claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.legacy.mockReset();
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
  });

  it("checks Neon claim eligibility before initializing deferred snapshot stores", async () => {
    mocks.getUser.mockResolvedValue(USER);
    mocks.completeWorkspaceClaim.mockResolvedValue({kind:"not_attached"});
    mocks.legacy.mockImplementation(()=>{throw new Error("legacy store unavailable");});
    expect((await post(BODY)).status).toBe(409);
    expect(mocks.legacy).not.toHaveBeenCalled();
  });

  it("builds a Neon snapshot and derives by hook job and persisted scope", async () => {
    mocks.getUser.mockResolvedValue(USER);
    mocks.completeWorkspaceClaim.mockImplementationOnce(async (_store, _input, hooks) => {
      await hooks.buildSnapshot("job-1", "ws-1", "loc-1");
      await hooks.deriveActions("job-1", "ws-1", "loc-1");
      return { kind: "completed", workspaceSlug: "unexpected", locationId: "loc-1" };
    });
    const response = await post(BODY);
    expect(mocks.buildSnapshot).toHaveBeenCalledWith(mocks.snapshotRepo, "job-1");
    expect(mocks.legacy).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(mocks.derive).toHaveBeenCalledWith("job-1", "ws-1", "loc-1");
  });

  it("401s without a verified session, before reading the body", async () => {
    mocks.getUser.mockResolvedValue(null);
    const res = await post(BODY);
    expect(res.status).toBe(401);
    expect(mocks.completeWorkspaceClaim).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });

  it("409s a market that disagrees with the scan, and says which one to send", async () => {
    // The market is money-bearing: workspaces.market picks the Stripe price.
    // Refused rather than silently corrected, so a tampered or stale client
    // cannot quietly land on the wrong price.
    mocks.getUser.mockResolvedValue(USER);
    mocks.completeWorkspaceClaim.mockResolvedValue({ kind: "market_mismatch", expected: "hk" });
    const response = await post({ ...BODY, market: "tw" });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "market_mismatch", expected: "hk" });
  });

  it("400s invalid JSON and an invalid body without touching the limiter or the database", async () => {
    mocks.getUser.mockResolvedValue(USER);
    expect((await post("{not json")).status).toBe(400);
    expect((await post({ ...BODY, claim_slug: "abc" })).status).toBe(400);
    expect((await post({ ...BODY, market: "jp" })).status).toBe(400);
    expect((await post({ ...BODY, primary_location: {} })).status).toBe(400);
    expect((await post({ ...BODY, timezone: "Mars/Olympus" })).status).toBe(400);
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.completeWorkspaceClaim).not.toHaveBeenCalled();
  });

  it("completes the claim for the session user and returns the workspace slug and location id", async () => {
    mocks.getUser.mockResolvedValue(USER);
    mocks.completeWorkspaceClaim.mockResolvedValue({
      kind: "completed",
      workspaceId: "ws-1",
      workspaceSlug: "kam-man-house",
      locationId: "loc-1",
    });

    const res = await post(BODY);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, workspaceSlug: "kam-man-house", locationId: "loc-1" });
    expect(mocks.completeWorkspaceClaim).toHaveBeenCalledWith(expect.anything(), {
      claimSlug: "abc123",
      workspaceName: "Kam Man House",
      primaryLocation: { name: "Tin Hau", address: "12 Electric Road" },
      market: "hk",
      timezone: "Asia/Hong_Kong",
      locale: "zh-HK",
      userId: "user-1",
      brandVoice: null,
      approvedClaims: null,
    }, expect.objectContaining({ buildSnapshot: expect.any(Function), deriveActions: expect.any(Function) }));
    // Rate limited per user (10/h), failing closed.
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "workspace_claim", identifiers: ["user-1"], failClosed: true }),
    );
  });

  it("maps the outcome kinds to 404 / 403 / 409", async () => {
    mocks.getUser.mockResolvedValue(USER);

    mocks.completeWorkspaceClaim.mockResolvedValue({ kind: "not_found" });
    expect((await post(BODY)).status).toBe(404);

    mocks.completeWorkspaceClaim.mockResolvedValue({ kind: "forbidden" });
    expect((await post(BODY)).status).toBe(403);

    mocks.completeWorkspaceClaim.mockResolvedValue({ kind: "not_attached" });
    const res = await post(BODY);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_attached" });
  });

  it("429s once the per-user budget is spent", async () => {
    mocks.getUser.mockResolvedValue(USER);
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 120 });

    const res = await post(BODY);

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("120");
    expect(mocks.completeWorkspaceClaim).not.toHaveBeenCalled();
  });

  it("503s without leaking detail when the completion throws", async () => {
    mocks.getUser.mockResolvedValue(USER);
    mocks.completeWorkspaceClaim.mockRejectedValue(new Error("job lookup failed: db.internal"));

    const res = await post(BODY);

    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/db\.internal/);
  });
});

describe("parseClaimBody", () => {
  it("accepts the camelCase spellings as aliases and defaults locale and timezone", () => {
    const parsed = parseClaimBody({
      claimSlug: "abc123",
      workspaceName: " Kam Man House ",
      primaryLocation: { name: "Tin Hau" },
      market: "TW",
    });
    expect(parsed).toEqual({
      ok: true,
      body: {
        claimSlug: "abc123",
        workspaceName: "Kam Man House",
        primaryLocation: { name: "Tin Hau", address: null },
        market: "tw",
        timezone: null,
        locale: "zh-HK",
        brandVoice: null,
        approvedClaims: null,
      },
    });
  });

  it("keeps the owner's onboarding brand basics instead of dropping them", () => {
    const parsed = parseClaimBody({ ...BODY, brand_voice: "professional", approved_claims: [" Family recipes since 1998 ", "", "Halal certified"] });
    expect(parsed).toMatchObject({ ok: true, body: { brandVoice: "professional", approvedClaims: ["Family recipes since 1998", "Halal certified"] } });
  });

  it("ignores a voice the server does not support rather than rejecting the claim", () => {
    // "concise" was the onboarding UI's own local value and is not in
    // BRAND_VOICES; an older client must not start failing on it.
    expect(parseClaimBody({ ...BODY, brand_voice: "concise" })).toMatchObject({ ok: true, body: { brandVoice: null } });
    expect(parseClaimBody({ ...BODY, approved_claims: "not-an-array" })).toMatchObject({ ok: true, body: { approvedClaims: null } });
  });

  it("rejects an over-long name or address", () => {
    expect(parseClaimBody({ ...BODY, workspace_name: "x".repeat(161) })).toEqual({ ok: false, error: "workspace_name is required" });
    expect(parseClaimBody({ ...BODY, primary_location: { name: "Tin Hau", address: "x".repeat(501) } })).toEqual({
      ok: false,
      error: "primary_location.address is invalid",
    });
  });
});

it('returns503 when Neon derivation fails after eligibility, without invoking legacy transport',async()=>{
 mocks.getUser.mockResolvedValue(USER);
 mocks.derive.mockRejectedValueOnce(new Error('fixture derivation failure'));
 mocks.completeWorkspaceClaim.mockImplementationOnce(async(_store,_input,hooks)=>{
  await hooks.deriveActions('job-1','ws-1','loc-1');
 });
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 try {
  const response=await post(BODY);expect(response.status).toBe(503);
  expect(await response.json()).toEqual({error:'unavailable'});
  expect(mocks.legacy).not.toHaveBeenCalled();
 }finally{log.mockRestore();}
});
