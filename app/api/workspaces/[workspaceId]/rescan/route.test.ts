import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  enqueueRescan: vi.fn(),
  ensureMonthlySchedule: vi.fn(),
  tier: "paid" as string | null,
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
vi.mock("@/lib/supabase/admin", () => ({
  supabaseServer: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "workspaces" ? { tier: mocks.tier } : null, error: null }) }) }),
    }),
  }),
}));

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

function post(body: unknown) {
  return import("./route").then(({ POST }) => POST(new Request(URL_BASE, { method: "POST", body: JSON.stringify(body) }), PARAMS));
}

beforeEach(() => {
  mocks.tier = "paid";
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
  mocks.enqueueRescan.mockResolvedValue({ ok: true, jobId: "job-new", sourceJob: { id: "job-src", status: "done", place_id: "place-1", created_at: "2026-08-15T10:00:00Z", input_snapshot: { version: 2 } } });
  mocks.ensureMonthlySchedule.mockResolvedValue({ created: true });
});

afterEach(() => vi.resetAllMocks());

describe("POST /api/workspaces/[workspaceId]/rescan", () => {
  it("enqueues for an owner on a paid workspace: 201 { jobId }, limiter keyed on the workspace id, schedule ensured", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));

    const res = await post({ locationId: LOCATION_ID, locale: "en" });

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
