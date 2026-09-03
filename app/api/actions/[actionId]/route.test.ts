import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ID, LOCATION_ID, WORKSPACE_ID, authorizeLike, makeDb, type Query } from "@/app/api/actions/_shared/test-db";

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
vi.mock("@/lib/workspace/queries", () => ({ loadWorkspaceContext: async () => ({ workspace: { id: WORKSPACE_ID } }) }));
vi.mock("@/lib/workspace/queries-pages", () => ({ getAction: async () => ({ action: { id: ACTION_ID, actionState: "dismissed" } }) }));

const PARAMS = { params: Promise.resolve({ actionId: ACTION_ID }) };
const patch = (body: unknown) => import("./route").then(({ PATCH }) => PATCH(new Request(`https://app.test/api/actions/${ACTION_ID}`, { method: "PATCH", body: JSON.stringify(body) }), PARAMS));

function respond(q: Query): unknown {
  if (q.table !== "actions" || q.op !== "select") return null;
  return { id: ACTION_ID, workspace_id: WORKSPACE_ID, location_id: LOCATION_ID, provided_inputs: { brand_voice: "warm" }, required_inputs: ["brand_voice", "channel"], action_state: "needs_input" };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db = makeDb(respond);
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [LOCATION_ID]));
});

describe("PATCH /api/actions/[actionId]", () => {
  it("dismisses an action and records action.dismissed", async () => {
    const res = await patch({ action_state: "dismissed", locale: "en" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ action: { id: ACTION_ID, actionState: "dismissed" } });
    const update = mocks.db!.calls.find((c) => c.table === "actions" && c.op === "update");
    expect(update?.payload).toMatchObject({ action_state: "dismissed" });
    expect(update?.filters).toEqual({ id: ACTION_ID, workspace_id: WORKSPACE_ID });
    const audit = mocks.db!.calls.find((c) => c.table === "audit_events")?.payload as Record<string, unknown>;
    expect(audit).toMatchObject({ event: "action.dismissed", entity_id: ACTION_ID, actor_id: "user-1", payload: expect.objectContaining({ locale: "en", action_state: "dismissed" }) });
  });

  it("merges provided_inputs and promotes needs_input → ready once nothing is missing", async () => {
    await patch({ provided_inputs: { channel: "WhatsApp" } });
    const update = mocks.db!.calls.find((c) => c.table === "actions" && c.op === "update");
    expect(update?.payload).toMatchObject({ provided_inputs: { brand_voice: "warm", channel: "WhatsApp" }, action_state: "ready" });
    expect((mocks.db!.calls.find((c) => c.table === "audit_events")?.payload as { event: string }).event).toBe("action.updated");
  });

  it("403s a viewer and an out-of-scope manager", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("viewer"));
    expect((await patch({ action_state: "completed" })).status).toBe(403);
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", ["elsewhere"]));
    expect((await patch({ action_state: "completed" })).status).toBe(403);
    expect(mocks.db!.calls.filter((c) => c.op === "update")).toEqual([]);
  });

  it("400s an unsupported state, a bad date and an empty patch", async () => {
    expect((await patch({ action_state: "recommended" })).status).toBe(400);
    expect((await patch({ due_at: "next tuesday" })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
  });
});
