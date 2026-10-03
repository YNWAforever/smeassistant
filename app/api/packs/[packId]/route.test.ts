import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeLike, LOCATION_ID, WORKSPACE_ID } from "@/app/api/actions/_shared/test-db";

const L1 = LOCATION_ID;
const L2 = "33333333-3333-4333-8333-333333333333";
const PACK_ID = "55555555-5555-4555-8555-555555555555";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  loadWorkspaceContext: vi.fn(),
  loadPackOverview: vi.fn(),
  packs: { startPack: vi.fn(), openPack: vi.fn(), getPack: vi.fn(), packScope: vi.fn() },
}));

vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args),
}));
vi.mock("@/lib/repositories/packs", () => ({ packRepository: () => mocks.packs }));
vi.mock("@/lib/workspace/queries", async (original) => ({
  ...(await original<typeof import("@/lib/workspace/queries")>()),
  loadWorkspaceContext: (...args: unknown[]) => mocks.loadWorkspaceContext(...args),
}));
vi.mock("@/lib/workspace/packs", async (original) => ({
  ...(await original<typeof import("@/lib/workspace/packs")>()),
  loadPackOverview: (...args: unknown[]) => mocks.loadPackOverview(...args),
}));

const packRow = { pack: { id: PACK_ID, workspaceId: WORKSPACE_ID, locationId: L1 }, itemRows: [] };
const overview = { pack: packRow.pack, items: [], counts: {}, nextToReview: null, finished: false };

const get = (id = PACK_ID) =>
  import("./route").then(({ GET }) =>
    GET(new Request(`https://app.test/api/packs/${id}`), { params: Promise.resolve({ packId: id }) }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORK_PACKS_ENABLED", "true");
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
  mocks.loadWorkspaceContext.mockResolvedValue({ workspace: { id: WORKSPACE_ID } });
  mocks.loadPackOverview.mockResolvedValue(overview);
  mocks.packs.packScope.mockResolvedValue({ workspaceId: WORKSPACE_ID, locationId: L1 });
  mocks.packs.getPack.mockResolvedValue(packRow);
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/packs/[packId]", () => {
  it("answers 404 when the flag is off, with neither the repository nor auth called", async () => {
    vi.stubEnv("WORK_PACKS_ENABLED", "TRUE");
    const res = await get();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    for (const fn of Object.values(mocks.packs)) expect(fn).not.toHaveBeenCalled();
  });

  it("returns the overview to any member with the pack's location in scope", async () => {
    for (const role of ["owner", "manager", "viewer"] as const) {
      mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike(role, role === "manager" ? [L1] : null));
      const res = await get();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ pack: overview });
    }
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID }, { minRole: "viewer", locationId: L1 });
  });

  it("reads a workspace-wide pack for a scoped manager", async () => {
    mocks.packs.packScope.mockResolvedValue({ workspaceId: WORKSPACE_ID, locationId: null });
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [L2]));
    expect((await get()).status).toBe(200);
  });

  it("refuses a scoped manager whose scope excludes the pack's location", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [L2]));
    const res = await get();
    expect(res.status).toBe(403);
    expect(mocks.packs.getPack).not.toHaveBeenCalled();
  });

  it("returns the status authorizeWorkspaceRequest gives a non-member", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    expect((await get()).status).toBe(403);
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 401, code: "unauthenticated" });
    expect((await get()).status).toBe(401);
    expect(mocks.packs.getPack).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown pack and 400 for a bad id", async () => {
    mocks.packs.packScope.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect((await get("nope")).status).toBe(400);
  });

  it("answers 503 without leaking the repository message", async () => {
    mocks.packs.packScope.mockRejectedValue(new Error("pack_read_failed"));
    const res = await get();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
    mocks.packs.packScope.mockResolvedValue({ workspaceId: WORKSPACE_ID, locationId: L1 });
    mocks.packs.getPack.mockResolvedValue(null);
    expect((await get()).status).toBe(503);
  });
});
