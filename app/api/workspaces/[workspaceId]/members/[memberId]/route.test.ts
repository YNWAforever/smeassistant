import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  recordEvent: vi.fn(),
  target: null as Record<string, unknown> | null,
  locations: [] as Array<{ id: string }>,
  updates: [] as Array<{ patch: Record<string, unknown>; filters: Record<string, unknown> }>,
  updateError: null as { message: string } | null,
}));

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/workspace/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workspace/audit")>();
  return { ...actual, recordEvent: (...args: unknown[]) => mocks.recordEvent(...args) };
});
vi.mock("@/lib/supabase/admin", () => ({
  supabaseServer: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: self,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return chain;
        },
        update: (patch: Record<string, unknown>) => {
          const updateChain: Record<string, unknown> = {};
          const done = () => Promise.resolve({ error: mocks.updateError });
          Object.assign(updateChain, {
            eq: (column: string, value: unknown) => {
              filters[column] = value;
              return updateChain;
            },
            then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
              mocks.updates.push({ patch, filters: { ...filters } });
              return done().then(resolve, reject);
            },
          });
          return updateChain;
        },
        returns: () => Promise.resolve({ data: table === "locations" ? mocks.locations : [], error: null }),
        maybeSingle: () => Promise.resolve({ data: table === "workspace_members" ? mocks.target : null, error: null }),
      });
      return chain;
    },
  }),
}));

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const LOC_1 = "22222222-2222-4222-8222-222222222222";
const LOC_OTHER = "33333333-3333-4333-8333-333333333333";
const URL_BASE = `https://app.test/api/workspaces/${WORKSPACE_ID}/members/member-2`;
const PARAMS = { params: Promise.resolve({ workspaceId: WORKSPACE_ID, memberId: "member-2" }) };

function auth(role: "owner" | "manager" | "viewer") {
  return {
    ok: true,
    user: { id: "user-1", email: "o@example.com", verified: true },
    membership: { workspaceId: WORKSPACE_ID, workspaceSlug: "demo", userId: "user-1", email: "o@example.com", role, locationScope: null },
  };
}

function patch(body: unknown) {
  return import("./route").then(({ PATCH }) => PATCH(new Request(URL_BASE, { method: "PATCH", body: JSON.stringify(body) }), PARAMS));
}

beforeEach(() => {
  mocks.target = { id: "member-2", role: "manager", location_scope: null };
  mocks.locations = [{ id: LOC_1 }];
  mocks.updates = [];
  mocks.updateError = null;
  mocks.recordEvent.mockResolvedValue(undefined);
});

afterEach(() => vi.resetAllMocks());

describe("PATCH /api/workspaces/[workspaceId]/members/[memberId]", () => {
  it("lets the owner change a role and scope, and records member.role_changed", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));

    const res = await patch({ role: "viewer", location_scope: [LOC_1, LOC_1], locale: "en" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID }, { minRole: "owner" });
    expect(mocks.updates).toEqual([{ patch: { role: "viewer", location_scope: [LOC_1] }, filters: { id: "member-2", workspace_id: WORKSPACE_ID } }]);
    expect(mocks.recordEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        actorType: "user",
        actorId: "user-1",
        event: "member.role_changed",
        entityType: "workspace_member",
        entityId: "member-2",
        locale: "en",
        payload: { from_role: "manager", role: "viewer", location_scope: [LOC_1] },
      }),
    );
  });

  it("is owner-only: the auth helper's refusal is returned before any read", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    expect((await patch({ role: "viewer" })).status).toBe(403);
    expect(mocks.updates).toEqual([]);
    expect(mocks.recordEvent).not.toHaveBeenCalled();
  });

  it("refuses to touch the owner row", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    mocks.target = { id: "member-2", role: "owner", location_scope: null };
    expect((await patch({ role: "viewer" })).status).toBe(403);
    expect(mocks.updates).toEqual([]);
  });

  it("404s a member that is not on this workspace", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    mocks.target = null;
    expect((await patch({ role: "viewer" })).status).toBe(404);
  });

  it("validates location_scope against the workspace's locations; null and [] mean all", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    expect((await patch({ location_scope: [LOC_OTHER] })).status).toBe(400);
    expect((await patch({ location_scope: ["not-a-uuid"] })).status).toBe(400);
    expect((await patch({ location_scope: "loc" })).status).toBe(400);
    expect(mocks.updates).toEqual([]);

    expect((await patch({ location_scope: null })).status).toBe(200);
    expect((await patch({ location_scope: [] })).status).toBe(200);
    expect(mocks.updates.map((u) => u.patch)).toEqual([{ location_scope: null }, { location_scope: null }]);
  });

  it("400s an owner role, an empty body and malformed JSON", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    expect((await patch({ role: "owner" })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    const { PATCH } = await import("./route");
    expect((await PATCH(new Request(URL_BASE, { method: "PATCH", body: "{" }), PARAMS)).status).toBe(400);
    expect(mocks.updates).toEqual([]);
  });

  it("500s when the update fails, without an audit event", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    mocks.updateError = { message: "boom" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await patch({ role: "viewer" })).status).toBe(500);
    expect(mocks.recordEvent).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
