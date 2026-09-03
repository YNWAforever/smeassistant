import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOCATION_ID, WORKSPACE_ID, authorizeLike, makeDb, type Query } from "@/app/api/actions/_shared/test-db";
import { objectiveDedupeKey } from "@/app/api/actions/_shared/mutation";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  runAgentForAction: vi.fn(),
  db: null as ReturnType<typeof import("@/app/api/actions/_shared/test-db").makeDb> | null,
}));

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => mocks.db }));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/rate-limit")>()),
  enforceRateLimit: async () => ({ allowed: true, retryAfterSeconds: 1 }),
}));
vi.mock("@/lib/workspace/runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace/runs")>()),
  runAgentForAction: (...args: unknown[]) => mocks.runAgentForAction(...args),
}));

let insertResult: unknown = { id: "act-new" };

function respond(q: Query): unknown {
  if (q.table === "locations") return { id: LOCATION_ID };
  if (q.table === "actions" && q.op === "insert") return insertResult;
  if (q.table === "actions") return { id: "act-existing" };
  return null;
}

const post = (body: unknown) => import("./route").then(({ POST }) => POST(new Request("https://app.test/api/actions", { method: "POST", body: JSON.stringify(body) })));
const base = { workspace_id: WORKSPACE_ID, template_key: "menu-translation", location_id: LOCATION_ID, objective: "Translate the dinner menu", locale: "zh-HK" };

beforeEach(() => {
  vi.clearAllMocks();
  insertResult = { id: "act-new" };
  mocks.db = makeDb(respond);
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
});

describe("POST /api/actions", () => {
  it("creates an owner-objective action with Recommended evidence and the objective dedupe key", async () => {
    const res = await post({ ...base, inputs: { menu_items: "叉燒飯" } });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ actionId: "act-new" });
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID }, { minRole: "manager", locationId: LOCATION_ID });
    const insert = mocks.db!.calls.find((c) => c.table === "actions" && c.op === "insert")?.payload as Record<string, unknown>;
    expect(insert).toMatchObject({
      workspace_id: WORKSPACE_ID,
      location_id: LOCATION_ID,
      template_key: "menu-translation",
      source: "owner_objective",
      action_state: "recommended",
      capability: "Beta",
      provided_inputs: { menu_items: "叉燒飯" },
      dedupe_key: objectiveDedupeKey(WORKSPACE_ID, LOCATION_ID, "menu-translation", "Translate the dinner menu"),
    });
    expect(insert.evidence).toMatchObject({ factType: "Recommended", detail: { en: "Translate the dinner menu" } });
    expect(insert.dedupe_key).toMatch(new RegExp(`^${WORKSPACE_ID}:${LOCATION_ID}:menu-translation:objective:[0-9a-f]{8}$`));
    expect((mocks.db!.calls.find((c) => c.table === "audit_events")?.payload as { event: string }).event).toBe("action.updated");
  });

  it("marks the action needs_input when template inputs are missing and runs it when asked", async () => {
    mocks.runAgentForAction.mockResolvedValue({ runId: "run-1", state: "succeeded", versionId: "v-1", versionNo: 1 });
    const res = await post({ ...base, run: true });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ actionId: "act-new", runId: "run-1", versionId: "v-1" });
    expect((mocks.db!.calls.find((c) => c.table === "actions" && c.op === "insert")?.payload as { action_state: string }).action_state).toBe("needs_input");
    expect(mocks.runAgentForAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ actionId: "act-new", actorId: "user-1", locale: "zh-HK" }));
  });

  it("returns the existing open action on a duplicate objective", async () => {
    insertResult = { data: null, error: { code: "23505" } };
    const res = await post(base);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ actionId: "act-existing" });
  });

  it("403s a viewer and an out-of-scope manager; 400s a bad template or objective", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("viewer"));
    expect((await post(base)).status).toBe(403);
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", ["elsewhere"]));
    expect((await post(base)).status).toBe(403);
    expect(mocks.db!.calls.filter((c) => c.op === "insert")).toEqual([]);
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
    expect((await post({ ...base, template_key: "not-a-template" })).status).toBe(400);
    expect((await post({ ...base, objective: "" })).status).toBe(400);
  });
});
