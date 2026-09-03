import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOCATION_ID, VERSION_ID, WORKSPACE_ID, authorizeLike, makeDb, type Query } from "@/app/api/actions/_shared/test-db";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  db: null as ReturnType<typeof import("@/app/api/actions/_shared/test-db").makeDb> | null,
}));

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => mocks.db }));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/rate-limit")>()),
  enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args),
}));

let usageRow: Record<string, unknown> | null = { period: "2026-09", approved_deliveries: 1, allowance: 3 };

function respond(q: Query): unknown {
  switch (q.table) {
    case "output_versions": return { id: VERSION_ID, action_id: "act-1", workspace_id: WORKSPACE_ID, actions: { location_id: LOCATION_ID } };
    case "workspaces": return { timezone: "Asia/Hong_Kong", tier: "lite" };
    case "workspace_usage": return q.op === "select" ? usageRow : null;
    default: return null;
  }
}

const PARAMS = { params: Promise.resolve({ versionId: VERSION_ID }) };
type Route = "approve" | "request-changes" | "reject" | "export";
const ROUTES: Record<Route, () => Promise<{ POST: (req: Request, ctx: typeof PARAMS) => Promise<Response> }>> = {
  approve: () => import("./approve/route"),
  "request-changes": () => import("./request-changes/route"),
  reject: () => import("./reject/route"),
  export: () => import("./export/route"),
};
async function post(route: Route, body: unknown = {}) {
  const mod = await ROUTES[route]();
  return mod.POST(new Request(`https://app.test/api/versions/${VERSION_ID}/${route}`, { method: "POST", body: JSON.stringify(body) }), PARAMS) as Promise<Response>;
}
const exportBody = { mode: "export", idempotency_key: "abcdefghijklmnop_-01" };

beforeEach(() => {
  vi.clearAllMocks();
  usageRow = { period: "2026-09", approved_deliveries: 1, allowance: 3 };
  mocks.db = makeDb(respond);
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [LOCATION_ID]));
});

describe("POST /api/versions/[versionId]/approve", () => {
  it("approves this exact version and reports idempotent on a repeat", async () => {
    mocks.db!.rpc.mockResolvedValueOnce({ data: { kind: "approved", version_id: VERSION_ID, version_no: 2 }, error: null });
    const first = await post("approve", { comment: "ship it" });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ state: "approved", delivery_state: "export_ready", idempotent: false, versionNo: 2 });
    expect(mocks.db!.rpc).toHaveBeenCalledWith("approve_output_version", { p_version_id: VERSION_ID, p_actor: "user-1", p_comment: "ship it" });
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID }, { minRole: "manager", locationId: LOCATION_ID });

    mocks.db!.rpc.mockResolvedValueOnce({ data: { kind: "already-approved", version_id: VERSION_ID, version_no: 2 }, error: null });
    expect(await (await post("approve")).json()).toMatchObject({ state: "approved", idempotent: true });
  });

  it("409s a closed version", async () => {
    mocks.db!.rpc.mockResolvedValue({ data: null, error: { message: "version_closed" } });
    const res = await post("approve");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "version_closed" });
  });
});

describe("request-changes / reject", () => {
  it("records the decision through the RPC", async () => {
    mocks.db!.rpc.mockResolvedValue({ data: { kind: "decided", version_id: VERSION_ID, version_no: 1, decision: "changes_requested" }, error: null });
    expect(await (await post("request-changes", { comment: "shorter" })).json()).toMatchObject({ state: "changes_requested" });
    expect(mocks.db!.rpc).toHaveBeenLastCalledWith("decide_output_version", { p_version_id: VERSION_ID, p_actor: "user-1", p_decision: "changes_requested", p_comment: "shorter" });
    mocks.db!.rpc.mockResolvedValue({ data: { kind: "decided", version_id: VERSION_ID, version_no: 1, decision: "rejected" }, error: null });
    expect(await (await post("reject")).json()).toMatchObject({ state: "rejected" });
    expect(mocks.db!.rpc).toHaveBeenLastCalledWith("decide_output_version", expect.objectContaining({ p_decision: "rejected", p_comment: null }));
  });
});

describe("POST /api/versions/[versionId]/export", () => {
  it("counts the first export once and returns the period usage", async () => {
    mocks.db!.rpc.mockResolvedValue({ data: { kind: "exported", delivery_id: "d-1", version_id: VERSION_ID, counted: true }, error: null });
    const res = await post("export", exportBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deliveryId: "d-1", counted: true, usage: { period: "2026-09", approved_deliveries: 1, allowance: 3 } });
    expect(mocks.db!.rpc).toHaveBeenCalledWith("export_output_version", { p_version_id: VERSION_ID, p_actor: "user-1", p_mode: "export", p_idempotency_key: exportBody.idempotency_key });
  });

  it("does not count a repeat of the same version (existing delivery, or a copy after an export)", async () => {
    mocks.db!.rpc.mockResolvedValue({ data: { kind: "existing", delivery_id: "d-1", version_id: VERSION_ID, counted: false }, error: null });
    expect(await (await post("export", exportBody)).json()).toMatchObject({ deliveryId: "d-1", counted: false });
    mocks.db!.rpc.mockResolvedValue({ data: { kind: "exported", delivery_id: "d-2", version_id: VERSION_ID, counted: false }, error: null });
    expect(await (await post("export", { mode: "copy", idempotency_key: "qrstuvwxyz0123456789" })).json()).toMatchObject({ deliveryId: "d-2", counted: false });
  });

  it("409s when the allowance is reached or the version is not approved", async () => {
    mocks.db!.rpc.mockResolvedValue({ data: null, error: { message: "allowance_exceeded" } });
    const blocked = await post("export", exportBody);
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toEqual({ error: "allowance_exceeded" });
    mocks.db!.rpc.mockResolvedValue({ data: null, error: { message: "not_approved" } });
    expect(await (await post("export", exportBody)).json()).toEqual({ error: "not_approved" });
  });

  it("400s a bad mode or idempotency key", async () => {
    expect((await post("export", { mode: "publish", idempotency_key: exportBody.idempotency_key })).status).toBe(400);
    expect((await post("export", { mode: "copy", idempotency_key: "short" })).status).toBe(400);
  });
});

describe("authorization on every version mutation", () => {
  it.each(["approve", "request-changes", "reject", "export"] as Route[])("%s → 403 for a viewer and an out-of-scope manager, 429 over the limit", async (route) => {
    const body = route === "export" ? exportBody : {};
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("viewer"));
    expect((await post(route, body)).status).toBe(403);
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", ["elsewhere"]));
    expect((await post(route, body)).status).toBe(403);
    expect(mocks.db!.rpc).not.toHaveBeenCalled();
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    expect((await post(route, body)).status).toBe(429);
  });
});
