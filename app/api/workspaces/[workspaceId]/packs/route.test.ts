import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeLike, LOCATION_ID, WORKSPACE_ID } from "@/app/api/actions/_shared/test-db";

const L1 = LOCATION_ID;
const L2 = "33333333-3333-4333-8333-333333333333";
const OTHER = "99999999-9999-4999-8999-999999999999";
const PACK_ID = "55555555-5555-4555-8555-555555555555";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  loadWorkspaceContext: vi.fn(),
  loadPackOverview: vi.fn(),
  packs: { startPack: vi.fn(), openPack: vi.fn(), getPack: vi.fn(), packScope: vi.fn() },
  artifacts: { assistantLocations: vi.fn() },
}));

vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args),
}));
vi.mock("@/lib/repositories/packs", () => ({ packRepository: () => mocks.packs }));
vi.mock("@/lib/repositories/artifacts", async (original) => ({
  ...(await original<typeof import("@/lib/repositories/artifacts")>()),
  artifactRepository: () => mocks.artifacts,
}));
vi.mock("@/lib/security/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/security/rate-limit")>()),
  enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args),
}));
vi.mock("@/lib/workspace/queries", async (original) => ({
  ...(await original<typeof import("@/lib/workspace/queries")>()),
  loadWorkspaceContext: (...args: unknown[]) => mocks.loadWorkspaceContext(...args),
}));
vi.mock("@/lib/workspace/packs", async (original) => ({
  ...(await original<typeof import("@/lib/workspace/packs")>()),
  loadPackOverview: (...args: unknown[]) => mocks.loadPackOverview(...args),
}));
vi.mock("@/lib/workspace/audit", async (original) => ({
  ...(await original<typeof import("@/lib/workspace/audit")>()),
  ipHashFor: () => "hash",
}));

const ctx = { params: Promise.resolve({ workspaceId: WORKSPACE_ID }) };
const packRow = { pack: { id: PACK_ID, workspaceId: WORKSPACE_ID, locationId: L1 }, itemRows: [] };
const overview = { pack: packRow.pack, items: [], counts: {}, nextToReview: null, finished: false };

const get = (query = `location=${L1}`) =>
  import("./route").then(({ GET }) => GET(new Request(`https://app.test/api/workspaces/x/packs?${query}`), ctx));
const post = (body: unknown) =>
  import("./route").then(({ POST }) =>
    POST(new Request("https://app.test/api/workspaces/x/packs", { method: "POST", body: JSON.stringify(body) }), ctx),
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORK_PACKS_ENABLED", "true");
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
  mocks.artifacts.assistantLocations.mockResolvedValue([{ id: L1 }, { id: L2 }]);
  mocks.loadWorkspaceContext.mockResolvedValue({ workspace: { id: WORKSPACE_ID } });
  mocks.loadPackOverview.mockResolvedValue(overview);
  mocks.packs.startPack.mockResolvedValue({ packId: PACK_ID, created: true, items: [] });
  mocks.packs.getPack.mockResolvedValue(packRow);
  mocks.packs.openPack.mockResolvedValue(packRow);
});

afterEach(() => vi.unstubAllEnvs());

describe("packs collection route: flag", () => {
  it("answers 404 on GET and POST when the flag is not exactly true, touching nothing", async () => {
    for (const value of ["TRUE", "1", ""]) {
      vi.stubEnv("WORK_PACKS_ENABLED", value);
      const res = await get();
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not_found" });
      expect((await post({ location_id: L1 })).status).toBe(404);
    }
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    for (const fn of Object.values(mocks.packs)) expect(fn).not.toHaveBeenCalled();
  });
});

describe("POST /api/workspaces/[id]/packs", () => {
  it("starts a pack for an owner and returns 201 with the overview", async () => {
    const res = await post({ location_id: L1 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ pack: overview, created: true });
    expect(mocks.packs.startPack).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      locationId: L1,
      actorId: "user-1",
      locale: "zh-HK",
      ipHash: "hash",
    });
    expect(mocks.loadPackOverview).toHaveBeenCalledWith({ workspace: { id: WORKSPACE_ID } }, packRow.pack, packRow.itemRows);
  });

  it("returns the same pack with created:false on a repeat", async () => {
    mocks.packs.startPack.mockResolvedValue({ packId: PACK_ID, created: false, items: [] });
    const res = await post({ location_id: L1 });
    expect(res.status).toBe(201);
    expect((await res.json()).created).toBe(false);
    expect(mocks.packs.getPack).toHaveBeenCalledWith(PACK_ID);
  });

  it("starts a workspace-wide pack for an owner and for an unscoped manager", async () => {
    expect((await post({ location_id: null })).status).toBe(201);
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", null));
    expect((await post({ location_id: null })).status).toBe(201);
    expect(mocks.packs.startPack).toHaveBeenCalledTimes(2);
    expect(mocks.packs.startPack).toHaveBeenLastCalledWith(expect.objectContaining({ locationId: null }));
  });

  it("refuses a workspace-wide start to a location-scoped manager (ruling P3)", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [L1]));
    const res = await post({ location_id: null });
    expect(res.status).toBe(403);
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.packs.startPack).not.toHaveBeenCalled();
  });

  it("lets a scoped manager start a pack for an in-scope location only", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [L1]));
    expect((await post({ location_id: L1 })).status).toBe(201);
    expect((await post({ location_id: L2 })).status).toBe(403);
    expect(mocks.packs.startPack).toHaveBeenCalledTimes(1);
  });

  it("refuses a viewer and passes through a non-member's status", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("viewer"));
    expect((await post({ location_id: L1 })).status).toBe(403);
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    expect((await post({ location_id: L1 })).status).toBe(403);
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 401, code: "unauthenticated" });
    expect((await post({ location_id: L1 })).status).toBe(401);
    expect(mocks.packs.startPack).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });

  it("rejects an invalid workspace id, a non-object body and a bad location_id with 400, before auth", async () => {
    const { POST } = await import("./route");
    const badId = await POST(new Request("https://app.test/x", { method: "POST", body: "{}" }), {
      params: Promise.resolve({ workspaceId: "nope" }),
    });
    expect(badId.status).toBe(400);
    expect((await POST(new Request("https://app.test/x", { method: "POST", body: "[1]" }), ctx)).status).toBe(400);
    expect((await post({ location_id: "nope" })).status).toBe(400);
    expect((await post({ location_id: 5 })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("rejects a location from another workspace with 400 before the limiter and any write", async () => {
    const res = await post({ location_id: OTHER });
    expect(res.status).toBe(400);
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.packs.startPack).not.toHaveBeenCalled();
  });

  it("answers 429 before any repository write", async () => {
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 7 });
    const res = await post({ location_id: L1 });
    expect(res.status).toBe(429);
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "action_mutation", failClosed: true, identifiers: ["user-1"] }),
    );
    expect(mocks.packs.startPack).not.toHaveBeenCalled();
  });

  it("answers 503 without leaking the repository message", async () => {
    mocks.packs.startPack.mockRejectedValue(new Error("pack_start_failed: relation work_packs"));
    const res = await post({ location_id: L1 });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
    mocks.packs.startPack.mockResolvedValue({ packId: PACK_ID, created: true, items: [] });
    mocks.packs.getPack.mockResolvedValue(null);
    expect((await post({ location_id: L1 })).status).toBe(503);
  });
});

describe("GET /api/workspaces/[id]/packs", () => {
  it("returns the open pack overview to any member", async () => {
    for (const role of ["owner", "manager", "viewer"] as const) {
      mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike(role, null));
      const res = await get();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ pack: overview });
    }
    expect(mocks.packs.openPack).toHaveBeenCalledWith(WORKSPACE_ID, L1);
  });

  it("returns pack:null when no pack is open, without building an overview", async () => {
    mocks.packs.openPack.mockResolvedValue(null);
    const res = await get();
    expect(await res.json()).toEqual({ pack: null });
    expect(mocks.loadPackOverview).not.toHaveBeenCalled();
  });

  it("reads the workspace-wide pack for location=none", async () => {
    const res = await get("location=none");
    expect(res.status).toBe(200);
    expect(mocks.packs.openPack).toHaveBeenCalledWith(WORKSPACE_ID, null);
  });

  it("lets a scoped manager read the workspace-wide pack and an in-scope location, not an out-of-scope one", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [L1]));
    expect((await get("location=none")).status).toBe(200);
    expect((await get(`location=${L1}`)).status).toBe(200);
    expect((await get(`location=${L2}`)).status).toBe(403);
    expect(mocks.packs.openPack).toHaveBeenCalledTimes(2);
  });

  it("returns the status authorizeWorkspaceRequest gives a non-member", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    expect((await get()).status).toBe(403);
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 401, code: "unauthenticated" });
    expect((await get()).status).toBe(401);
    expect(mocks.packs.openPack).not.toHaveBeenCalled();
  });

  it("rejects a bad workspace id and a bad or missing location with 400, before auth", async () => {
    const { GET } = await import("./route");
    const badId = await GET(new Request("https://app.test/x?location=none"), { params: Promise.resolve({ workspaceId: "nope" }) });
    expect(badId.status).toBe(400);
    expect((await get("location=nope")).status).toBe(400);
    expect((await get("")).status).toBe(400);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("answers 503 without leaking the repository message", async () => {
    mocks.packs.openPack.mockRejectedValue(new Error("pack_read_failed"));
    const res = await get();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });
});
