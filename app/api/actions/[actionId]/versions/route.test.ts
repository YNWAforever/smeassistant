import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ID, LOCATION_ID, WORKSPACE_ID, authorizeLike, makeDb } from "@/app/api/actions/_shared/test-db";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  db: null as ReturnType<typeof import("@/app/api/actions/_shared/test-db").makeDb> | null,
}));

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => mocks.db }));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/rate-limit")>()),
  enforceRateLimit: async () => ({ allowed: true, retryAfterSeconds: 1 }),
}));

const PARAMS = { params: Promise.resolve({ actionId: ACTION_ID }) };
const post = (body: unknown) => import("./route").then(({ POST }) => POST(new Request(`https://app.test/api/actions/${ACTION_ID}/versions`, { method: "POST", body: JSON.stringify(body) }), PARAMS));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db = makeDb((q) => (q.table === "actions" ? { id: ACTION_ID, workspace_id: WORKSPACE_ID, location_id: LOCATION_ID } : null));
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
});

describe("POST /api/actions/[actionId]/versions", () => {
  it("saves a manual edit as v2 on top of v1 through the RPC", async () => {
    mocks.db!.rpc.mockResolvedValue({ data: { kind: "created", version_id: "v-2", version_no: 2 }, error: null });
    const res = await post({ body: "Edited draft", alt_text: " roast goose ", base_version_id: "55555555-5555-4555-8555-555555555555" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ versionId: "v-2", versionNo: 2 });
    expect(mocks.db!.rpc).toHaveBeenCalledWith("create_output_version", {
      p_action_id: ACTION_ID,
      p_actor: "user-1",
      p_author_type: "user",
      p_action_run_id: null,
      p_body: "Edited draft",
      p_alt: "roast goose",
      p_meta: {},
      p_base_version_id: "55555555-5555-4555-8555-555555555555",
    });
  });

  it("409s a stale base version", async () => {
    mocks.db!.rpc.mockResolvedValue({ data: null, error: { message: "version_conflict", code: "P0001" } });
    const res = await post({ body: "Edited", base_version_id: "55555555-5555-4555-8555-555555555555" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "version_conflict" });
  });

  it("403s a viewer and an out-of-scope manager before touching the RPC", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("viewer"));
    expect((await post({ body: "x" })).status).toBe(403);
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", ["elsewhere"]));
    expect((await post({ body: "x" })).status).toBe(403);
    expect(mocks.db!.rpc).not.toHaveBeenCalled();
  });

  it("400s an empty body or a malformed base id", async () => {
    expect((await post({ body: "   " })).status).toBe(400);
    expect((await post({ body: "ok", base_version_id: "nope" })).status).toBe(400);
  });
});
