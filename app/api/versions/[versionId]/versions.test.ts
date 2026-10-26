import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOCATION_ID,
  VERSION_ID,
  WORKSPACE_ID,
  authorizeLike,
  makeDb,
  type Query,
} from "@/app/api/actions/_shared/test-db";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  db: null as ReturnType<
    typeof import("@/app/api/actions/_shared/test-db").makeDb
  > | null,
}));

vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  authorizeWorkspaceRequest: (...args: unknown[]) =>
    mocks.authorizeWorkspaceRequest(...args),
}));
vi.mock("@/lib/repositories/artifacts", async (original) => ({
  ...(await original<typeof import("@/lib/repositories/artifacts")>()),
  artifactRepository: () => mocks.db,
}));
vi.mock("@/lib/repositories/action-mutations", () => ({
  actionMutationRepository: () => mocks.db,
}));
vi.mock("@/lib/repositories/workspace-read", () => ({
  workspaceReadRepository: () => mocks.db,
}));
vi.mock("@/lib/repositories/notifications", () => ({
  notificationRepository: () => mocks.db,
}));
vi.mock("@/lib/repositories/claims", () => ({
  recordClaimAuditEvent: (row: Record<string, unknown>) => mocks.db?.audit(row),
}));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/rate-limit")>()),
  enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args),
}));

let usageRow: Record<string, unknown> | null = {
  period: "2026-09",
  approved_deliveries: 1,
  allowance: 3,
};

function respond(q: Query): unknown {
  switch (q.table) {
    case "actions":
      return {
        id: "act-1",
        workspace_id: WORKSPACE_ID,
        location_id: LOCATION_ID,
      };
    case "output_versions":
      return {
        id: VERSION_ID,
        action_id: "act-1",
        workspace_id: WORKSPACE_ID,
        actions: { location_id: LOCATION_ID },
      };
    case "workspaces":
      return { timezone: "Asia/Hong_Kong", tier: "lite" };
    case "workspace_usage":
      return q.op === "select" ? usageRow : null;
    default:
      return null;
  }
}

const PARAMS = { params: Promise.resolve({ versionId: VERSION_ID }) };
type Route = "approve" | "request-changes" | "reject" | "export";
const ROUTES: Record<
  Route,
  () => Promise<{
    POST: (req: Request, ctx: typeof PARAMS) => Promise<Response>;
  }>
> = {
  approve: () => import("./approve/route"),
  "request-changes": () => import("./request-changes/route"),
  reject: () => import("./reject/route"),
  export: () => import("./export/route"),
};
// Module compilation is fixture initialization. A cold import inside the first
// behavior test can outlive its timeout and race the retry's freshly reset mocks.
beforeAll(async () => {
  for (const load of Object.values(ROUTES)) await load();
});
async function post(route: Route, body: unknown = {}, versionId = VERSION_ID) {
  const mod = await ROUTES[route]();
  return mod.POST(
    new Request(`https://app.test/api/versions/${versionId}/${route}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ versionId }) },
  ) as Promise<Response>;
}
const exportBody = { mode: "export", idempotency_key: "abcdefghijklmnop_-01" };

beforeEach(() => {
  vi.clearAllMocks();
  usageRow = { period: "2026-09", approved_deliveries: 1, allowance: 3 };
  mocks.db = makeDb(respond);
  mocks.enforceRateLimit.mockResolvedValue({
    allowed: true,
    retryAfterSeconds: 1,
  });
  mocks.authorizeWorkspaceRequest.mockImplementation(
    authorizeLike("manager", [LOCATION_ID]),
  );
});

describe("POST /api/versions/[versionId]/approve", () => {
  it("approves this exact version and reports idempotent on a repeat", async () => {
    mocks.db!.rpc.mockResolvedValueOnce({
      data: { kind: "approved", version_id: VERSION_ID, version_no: 2 },
      error: null,
    });
    const first = await post("approve", { comment: "ship it" });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      state: "approved",
      delivery_state: "export_ready",
      idempotent: false,
      versionNo: 2,
    });
    expect(mocks.db!.rpc).toHaveBeenCalledWith("approve_output_version", {
      p_version_id: VERSION_ID,
      p_actor: "user-1",
      p_comment: "ship it",
    });
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith(
      { id: WORKSPACE_ID },
      { minRole: "manager", locationId: LOCATION_ID },
    );

    mocks.db!.rpc.mockResolvedValueOnce({
      data: { kind: "already-approved", version_id: VERSION_ID, version_no: 2 },
      error: null,
    });
    expect(await (await post("approve")).json()).toMatchObject({
      state: "approved",
      idempotent: true,
    });
  });

  it("409s a closed version", async () => {
    mocks.db!.rpc.mockResolvedValue({
      data: null,
      error: { message: "version_closed" },
    });
    const res = await post("approve");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "version_closed" });
  });

  it.each(["offer_changed", "offer_inactive", "offer_expired"])("409s a version whose offer is no longer current (%s)", async (code) => {
    mocks.db!.rpc.mockResolvedValue({ data: null, error: { message: code } });
    const res = await post("approve");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: code });
  });
});

describe("request-changes / reject", () => {
  it("records the decision through the RPC", async () => {
    mocks.db!.rpc.mockResolvedValue({
      data: {
        kind: "decided",
        version_id: VERSION_ID,
        version_no: 1,
        decision: "changes_requested",
      },
      error: null,
    });
    expect(
      await (await post("request-changes", { comment: "shorter" })).json(),
    ).toMatchObject({ state: "changes_requested" });
    expect(mocks.db!.rpc).toHaveBeenLastCalledWith("decide_output_version", {
      p_version_id: VERSION_ID,
      p_actor: "user-1",
      p_decision: "changes_requested",
      p_comment: "shorter",
    });
    mocks.db!.rpc.mockResolvedValue({
      data: {
        kind: "decided",
        version_id: VERSION_ID,
        version_no: 1,
        decision: "rejected",
      },
      error: null,
    });
    expect(await (await post("reject")).json()).toMatchObject({
      state: "rejected",
    });
    expect(mocks.db!.rpc).toHaveBeenLastCalledWith(
      "decide_output_version",
      expect.objectContaining({ p_decision: "rejected", p_comment: null }),
    );
  });
});

describe("POST /api/versions/[versionId]/export", () => {
  it("counts the first export once and returns the period usage", async () => {
    mocks.db!.rpc.mockResolvedValue({
      data: {
        kind: "exported",
        delivery_id: "d-1",
        version_id: VERSION_ID,
        counted: true,
      },
      error: null,
    });
    const res = await post("export", exportBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deliveryId: "d-1",
      counted: true,
      usage: { period: "2026-09", approved_deliveries: 1, allowance: 3 },
    });
    expect(mocks.db!.rpc).toHaveBeenCalledWith("export_output_version", {
      p_version_id: VERSION_ID,
      p_actor: "user-1",
      p_mode: "export",
      p_idempotency_key: exportBody.idempotency_key,
    });
  });

  it("does not count a repeat of the same version (existing delivery, or a copy after an export)", async () => {
    mocks.db!.rpc.mockResolvedValue({
      data: {
        kind: "existing",
        delivery_id: "d-1",
        version_id: VERSION_ID,
        counted: false,
      },
      error: null,
    });
    expect(await (await post("export", exportBody)).json()).toMatchObject({
      deliveryId: "d-1",
      counted: false,
    });
    mocks.db!.rpc.mockResolvedValue({
      data: {
        kind: "exported",
        delivery_id: "d-2",
        version_id: VERSION_ID,
        counted: false,
      },
      error: null,
    });
    expect(
      await (
        await post("export", {
          mode: "copy",
          idempotency_key: "qrstuvwxyz0123456789",
        })
      ).json(),
    ).toMatchObject({ deliveryId: "d-2", counted: false });
  });

  it("409s when the allowance is reached or the version is not approved", async () => {
    mocks.db!.rpc.mockResolvedValue({
      data: null,
      error: { message: "allowance_exceeded" },
    });
    const blocked = await post("export", exportBody);
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toEqual({ error: "allowance_exceeded" });
    mocks.db!.rpc.mockResolvedValue({
      data: null,
      error: { message: "not_approved" },
    });
    expect(await (await post("export", exportBody)).json()).toEqual({
      error: "not_approved",
    });
  });

  it("400s a bad mode or idempotency key", async () => {
    expect(
      (
        await post("export", {
          mode: "publish",
          idempotency_key: exportBody.idempotency_key,
        })
      ).status,
    ).toBe(400);
    expect(
      (await post("export", { mode: "copy", idempotency_key: "short" })).status,
    ).toBe(400);
    expect(mocks.db!.rpc).not.toHaveBeenCalled();
  });

  it("reuses the delivery key after a committed export whose usage read failed", async () => {
    const usage = vi.spyOn(mocks.db!, "usage");
    usage.mockRejectedValueOnce(new Error("fixture_usage_unavailable"));
    mocks.db!.rpc.mockResolvedValueOnce({
      data: { kind: "exported", delivery_id: "d-1", version_id: VERSION_ID, counted: true },
      error: null,
    }).mockResolvedValueOnce({
      data: { kind: "existing", delivery_id: "d-1", version_id: VERSION_ID, counted: false },
      error: null,
    });

    const failed = await post("export", exportBody);
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "unavailable" });
    const retry = await post("export", exportBody);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({
      deliveryId: "d-1",
      counted: false,
      usage: { period: "2026-09", approved_deliveries: 1, allowance: 3 },
    });
    expect(mocks.db!.rpc).toHaveBeenCalledTimes(2);
    for (const call of mocks.db!.rpc.mock.calls) {
      expect(call).toEqual(["export_output_version", {
        p_version_id: VERSION_ID,
        p_actor: "user-1",
        p_mode: "export",
        p_idempotency_key: exportBody.idempotency_key,
      }]);
    }
  });
});

describe.each(Object.keys(ROUTES) as Route[])("%s failure boundaries", (route) => {
  const body = route === "export" ? exportBody : {};

  it("rejects malformed version ids before reading scope or authorizing", async () => {
    const scope = vi.spyOn(mocks.db!, "versionScope");
    const res = await post(route, body, "not-a-uuid");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "versionId is invalid" });
    expect(scope).not.toHaveBeenCalled();
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.db!.rpc).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing version before spending a mutation token", async () => {
    vi.spyOn(mocks.db!, "versionScope").mockResolvedValueOnce(null);
    const res = await post(route, body);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.db!.rpc).not.toHaveBeenCalled();
  });

  it("returns a sanitized retryable response when scope lookup fails", async () => {
    vi.spyOn(mocks.db!, "versionScope").mockRejectedValueOnce(new Error("private database diagnostic"));
    const res = await post(route, body);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.db!.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [401, "unauthenticated"],
    [403, "forbidden"],
    [404, "not_found"],
  ] as const)("preserves an authorization refusal (%i %s) without mutation", async (status, code) => {
    mocks.authorizeWorkspaceRequest.mockResolvedValueOnce({ ok: false, status, code });
    const res = await post(route, body);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: code });
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.db!.rpc).not.toHaveBeenCalled();
  });

  it.each(["identity_provider_unavailable", "membership_dependency_unavailable"])(
    "fails closed on %s without spending quota or changing a version",
    async (reason) => {
      mocks.authorizeWorkspaceRequest.mockRejectedValueOnce(new Error(reason));
      const res = await post(route, body);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "unavailable" });
      expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
      expect(mocks.db!.rpc).not.toHaveBeenCalled();
    },
  );

  it("refuses a version whose parent action has disappeared", async () => {
    vi.spyOn(mocks.db!, "assistantActions").mockResolvedValueOnce([]);
    const res = await post(route, body);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.db!.rpc).not.toHaveBeenCalled();
  });

  it("rechecks the parent action's workspace before spending quota or mutating", async () => {
    vi.spyOn(mocks.db!, "actionScope").mockResolvedValueOnce({
      actionId: "act-1",
      workspaceId: "another-workspace",
      locationId: LOCATION_ID,
    });
    const res = await post(route, body);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.db!.rpc).not.toHaveBeenCalled();
  });

  it("returns unavailable when the action recheck fails", async () => {
    vi.spyOn(mocks.db!, "assistantActions").mockRejectedValueOnce(new Error("private action diagnostic"));
    const res = await post(route, body);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.db!.rpc).not.toHaveBeenCalled();
  });

  it("keeps unexpected workflow failures private and retryable", async () => {
    mocks.db!.rpc.mockRejectedValueOnce(new Error("private workflow diagnostic"));
    const res = await post(route, body);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
    expect(mocks.db!.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("authorization on every version mutation", () => {
  it.each(["approve", "request-changes", "reject", "export"] as Route[])(
    "%s → 403 for a viewer and an out-of-scope manager, 429 over the limit",
    async (route) => {
      const body = route === "export" ? exportBody : {};
      mocks.authorizeWorkspaceRequest.mockImplementation(
        authorizeLike("viewer"),
      );
      expect((await post(route, body)).status).toBe(403);
      mocks.authorizeWorkspaceRequest.mockImplementation(
        authorizeLike("manager", ["elsewhere"]),
      );
      expect((await post(route, body)).status).toBe(403);
      expect(mocks.db!.rpc).not.toHaveBeenCalled();
      mocks.authorizeWorkspaceRequest.mockImplementation(
        authorizeLike("owner"),
      );
      mocks.enforceRateLimit.mockResolvedValue({
        allowed: false,
        retryAfterSeconds: 30,
      });
      const limited = await post(route, body);
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).toBe("30");
      expect(mocks.db!.rpc).not.toHaveBeenCalled();
    },
  );
});
