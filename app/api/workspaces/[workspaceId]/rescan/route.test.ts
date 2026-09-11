import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  enqueueRescan: vi.fn(),
  ensureMonthlySchedule: vi.fn(),
  tier: "paid" as string | null,
  readTier: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/rate-limit")>();
  return { ...actual, enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args) };
});
vi.mock("@/lib/workspace/rescan", () => ({
  enqueueRescan: (...args: unknown[]) => mocks.enqueueRescan(...args),
  ensureMonthlySchedule: (...args: unknown[]) => mocks.ensureMonthlySchedule(...args),
}));
vi.mock("@/lib/repositories/rescan", () => ({ rescanRepository: () => ({tier: (...args: unknown[]) => mocks.readTier(...args)}) }));

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const LOCATION_ID = "22222222-2222-4222-8222-222222222222";
const URL_BASE = `https://app.test/api/workspaces/${WORKSPACE_ID}/rescan`;
const PARAMS = { params: Promise.resolve({ workspaceId: WORKSPACE_ID }) };

function auth(role: "owner" | "manager" | "viewer") {
  return {
    ok: true,
    user: { id: "user-1", email: "o@example.com", verified: true },
    membership: { workspaceId: WORKSPACE_ID, workspaceSlug: "demo", userId: "user-1", email: "o@example.com", role, locationScope: null },
  };
}

// The route now requires a parsed, version-checked public-evidence consent.
// Defaulted here so each case below still describes its own concern (tier,
// authorization, the limiter) rather than repeating consent; the consent itself
// has dedicated cases.
const CONSENT_BODY = { public_evidence_consent: true, consent_policy_version: "2026-07-28" };

function postRaw(body: Record<string, unknown>) {
  return import("./route").then(({ POST }) => POST(new Request(URL_BASE, { method: "POST", body: JSON.stringify(body) }), PARAMS));
}

function post(body: Record<string, unknown>) {
  return import("./route").then(({ POST }) => POST(new Request(URL_BASE, { method: "POST", body: JSON.stringify({ ...CONSENT_BODY, ...body }) }), PARAMS));
}

beforeEach(() => {
  mocks.tier = "paid";
  mocks.readTier.mockImplementation(async () => mocks.tier);
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
  mocks.enqueueRescan.mockResolvedValue({ ok: true, jobId: "job-new", sourceJob: { id: "job-src", status: "done", place_id: "place-1", created_at: "2026-08-15T10:00:00Z", input_snapshot: { version: 2 } } });
  mocks.ensureMonthlySchedule.mockResolvedValue({ created: true });
});

afterEach(() => vi.resetAllMocks());

describe("POST /api/workspaces/[workspaceId]/rescan", () => {
  it("refuses a rescan that carries no consent, before touching the database", async () => {
    // enqueueRescan used to build the consent itself -- granted:true stamped
    // with whatever version was published -- so consent_records held a
    // policy-versioned agreement the owner had never been shown (guardrail 13).
    const res = await postRaw({ locationId: LOCATION_ID, locale: "en" });
    expect(res.status).toBe(400);
    expect(mocks.enqueueRescan).not.toHaveBeenCalled();
    // Refused with the body, before authorization or the tier read.
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("refuses a consent stamped with a superseded policy version", async () => {
    // The whole point of recording a version: an owner who agreed to an older
    // policy has not agreed to the current one, so this must 409 rather than
    // silently restamp it.
    const res = await postRaw({ locationId: LOCATION_ID, locale: "en", public_evidence_consent: true, consent_policy_version: "2020-01-01" });
    expect(res.status).toBe(409);
    expect(mocks.enqueueRescan).not.toHaveBeenCalled();
  });

  it("enqueues for an owner on a paid workspace: 201 { jobId }, limiter keyed on the workspace id, schedule ensured", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));

    const res = await post({ locationId: LOCATION_ID, locale: "en" });
    // The consent recorded is the one the caller submitted, not one this route
    // invented on their behalf.
    expect(mocks.enqueueRescan).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ consent: expect.objectContaining({ consentType: "public_evidence", granted: true, policyVersion: "2026-07-28" }) }),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ jobId: "job-new" });
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID }, { minRole: "manager", locationId: LOCATION_ID });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ scope: "rescan", identifiers: [WORKSPACE_ID], failClosed: true }));
    expect(mocks.enqueueRescan).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ workspaceId: WORKSPACE_ID, locationId: LOCATION_ID, actorId: "user-1", locale: "en" }),
    );
    expect(mocks.ensureMonthlySchedule).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ workspaceId: WORKSPACE_ID, actorId: "user-1", job: expect.objectContaining({ id: "job-src" }) }),
    );
  });

  it("403 tier_required on a lite workspace, before the limiter spends anything", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    mocks.tier = "lite";

    const res = await post({ locationId: LOCATION_ID });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "tier_required" });
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.enqueueRescan).not.toHaveBeenCalled();
  });

  it("403 for a viewer and for a manager outside the location scope (the auth helper decides)", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    expect((await post({ locationId: LOCATION_ID })).status).toBe(403);
    expect((await post({ locationId: LOCATION_ID })).status).toBe(403);

    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 401, code: "unauthenticated" });
    expect((await post({ locationId: LOCATION_ID })).status).toBe(401);
    expect(mocks.enqueueRescan).not.toHaveBeenCalled();
  });

  it("429 when the workspace's daily budget is spent", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("manager"));
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 3600 });

    const res = await post({ locationId: LOCATION_ID });

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("3600");
    expect(mocks.enqueueRescan).not.toHaveBeenCalled();
  });

  it("404 when the location has no finished scan to rebuild from", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    mocks.enqueueRescan.mockResolvedValue({ ok: false, reason: "no_finished_job" });

    const res = await post({ locationId: LOCATION_ID });

    expect(res.status).toBe(404);
    expect(mocks.ensureMonthlySchedule).not.toHaveBeenCalled();
  });

  it("400 on a malformed body and never touches auth", async () => {
    expect((await post({ locationId: "not-a-uuid" })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("still 201s when the monthly schedule is refused or throws", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.ensureMonthlySchedule.mockResolvedValue({ created: false, reason: "no_place_id" });
    expect((await post({ locationId: LOCATION_ID })).status).toBe(201);
    mocks.ensureMonthlySchedule.mockRejectedValue(new Error("boom"));
    expect((await post({ locationId: LOCATION_ID })).status).toBe(201);
    warn.mockRestore();
    error.mockRestore();
  });
});

it("keeps authorization, tier, atomic rate limit and enqueue ordering", async () => {
 mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
 expect((await post({locationId:LOCATION_ID,locale:"zh-TW"})).status).toBe(201);
 expect(mocks.readTier).toHaveBeenCalledWith(WORKSPACE_ID);
 const order=[mocks.authorizeWorkspaceRequest,mocks.readTier,mocks.enforceRateLimit,mocks.enqueueRescan,mocks.ensureMonthlySchedule].map(fn=>fn.mock.invocationCallOrder[0]);
 expect(order).toEqual([...order].sort((a,b)=>a-b));
});
it("maps tier SQL failure to503 before spending the budget",async()=>{
 mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
 mocks.readTier.mockRejectedValue(new Error("private SQL detail"));
 const res=await post({locationId:LOCATION_ID});expect(res.status).toBe(503);expect(await res.json()).toEqual({error:"unavailable"});
 expect(mocks.enforceRateLimit).not.toHaveBeenCalled(); expect(mocks.enqueueRescan).not.toHaveBeenCalled();
});
it.each([["snapshot_not_v2",409,"snapshot_not_rescannable"],["insert_failed",503,"unavailable"]])("maps %s without a schedule",async(reason,status,error)=>{
 mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));mocks.enqueueRescan.mockResolvedValue({ok:false,reason});
 const res=await post({locationId:LOCATION_ID});expect(res.status).toBe(status);expect(await res.json()).toEqual({error});expect(mocks.ensureMonthlySchedule).not.toHaveBeenCalled();
});
