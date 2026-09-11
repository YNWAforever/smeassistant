import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTION_ID,
  LOCATION_ID,
  WORKSPACE_ID,
  authorizeLike,
  makeDb,
} from "@/app/api/actions/_shared/test-db";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
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
  enforceRateLimit: async () => ({ allowed: true, retryAfterSeconds: 1 }),
}));

const PARAMS = { params: Promise.resolve({ actionId: ACTION_ID }) };
const post = (body: unknown) =>
  import("./route").then(({ POST }) =>
    POST(
      new Request(`https://app.test/api/actions/${ACTION_ID}/versions`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
      PARAMS,
    ),
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db = makeDb((q) =>
    q.table === "actions"
      ? { id: ACTION_ID, workspace_id: WORKSPACE_ID, location_id: LOCATION_ID }
      : null,
  );
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
});

describe("POST /api/actions/[actionId]/versions", () => {
  it("saves a manual edit as v2 on top of v1 through the RPC", async () => {
    mocks.db!.rpc.mockResolvedValue({
      data: { kind: "created", version_id: "v-2", version_no: 2 },
      error: null,
    });
    const res = await post({
      body: "Edited draft",
      alt_text: " roast goose ",
      base_version_id: "55555555-5555-4555-8555-555555555555",
    });
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
    mocks.db!.rpc.mockResolvedValue({
      data: null,
      error: { message: "version_conflict", code: "P0001" },
    });
    const res = await post({
      body: "Edited",
      base_version_id: "55555555-5555-4555-8555-555555555555",
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "version_conflict" });
  });

  it("403s a viewer and an out-of-scope manager before touching the RPC", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("viewer"));
    expect((await post({ body: "x" })).status).toBe(403);
    mocks.authorizeWorkspaceRequest.mockImplementation(
      authorizeLike("manager", ["elsewhere"]),
    );
    expect((await post({ body: "x" })).status).toBe(403);
    expect(mocks.db!.rpc).not.toHaveBeenCalled();
  });

  it("400s an empty body or a malformed base id", async () => {
    expect((await post({ body: "   " })).status).toBe(400);
    expect((await post({ body: "ok", base_version_id: "nope" })).status).toBe(
      400,
    );
  });
});

/**
 * The Visibility Operator's output used to travel through the body form above,
 * which hard-codes `author_type: 'user'` -- so the append-only log recorded a
 * member as the author of text a model wrote, with no `action_runs` link and
 * the token usage never costed. The run id is now the only thing the client
 * sends; the body is read from the run the server persisted.
 */
describe("POST /api/actions/[actionId]/versions (operator draft)", () => {
  const RUN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const draftRow = {
    output: {
      title: "Reply draft",
      body: "Thank you for telling us; we are adding a host at Friday lunch.",
      alt_text: null,
      acceptance_criteria: ["no compensation"],
      warnings: ["prohibited_term:best in Hong Kong"],
      facts_used: ["voice"],
    },
    agent_key: "review_reply",
    prompt_version: "2026-09-01",
    input: { source: "assistant", intent: "draft_review_reply" },
  };

  function withDraft(row: unknown = draftRow) {
    mocks.db = makeDb((q) =>
      q.table === "actions"
        ? { id: ACTION_ID, workspace_id: WORKSPACE_ID, location_id: LOCATION_ID }
        : q.table === "action_runs"
          ? row
          : null,
    );
    mocks.db.rpc.mockResolvedValue({
      data: { kind: "created", version_id: "v-3", version_no: 3 },
      error: null,
    });
  }

  it("records the server's own body as an agent version linked to the run", async () => {
    withDraft();
    const res = await post({ assistant_run_id: RUN_ID });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ versionId: "v-3", versionNo: 3 });
    expect(mocks.db!.rpc).toHaveBeenCalledWith("create_output_version", {
      p_action_id: ACTION_ID,
      p_actor: "user-1",
      // The whole point: not "user".
      p_author_type: "agent",
      p_action_run_id: RUN_ID,
      p_body: draftRow.output.body,
      p_alt: null,
      p_meta: {
        origin: "assistant",
        agent_key: "review_reply",
        prompt_version: "2026-09-01",
        intent: "draft_review_reply",
        title: "Reply draft",
        acceptance_criteria: ["no compensation"],
        // Carried through so the approval panel shows the guardrail the agent
        // already found, instead of a clean-looking draft.
        warnings: ["prohibited_term:best in Hong Kong"],
        facts_used: ["voice"],
      },
      p_base_version_id: null,
    });
    // Scoped by all three ids, so another action's or workspace's run cannot be
    // redeemed here.
    expect(mocks.db!.calls).toContainEqual({
      table: "action_runs",
      op: "select",
      payload: null,
      filters: { id: RUN_ID, action_id: ACTION_ID, workspace_id: WORKSPACE_ID },
    });
  });

  it("refuses a body and a run id together, and a malformed run id", async () => {
    withDraft();
    const both = await post({ assistant_run_id: RUN_ID, body: "my own words" });
    expect(both.status).toBe(400);
    expect(await both.json()).toEqual({
      error: "body and assistant_run_id are exclusive",
    });
    expect((await post({ assistant_run_id: "nope" })).status).toBe(400);
    expect(mocks.db!.rpc).not.toHaveBeenCalled();
  });

  it("404s a run that does not exist, or one whose output has no body", async () => {
    withDraft(null);
    const missing = await post({ assistant_run_id: RUN_ID });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "assistant_draft_not_found" });

    withDraft({ ...draftRow, output: { ...draftRow.output, body: "  " } });
    expect((await post({ assistant_run_id: RUN_ID })).status).toBe(404);
    expect(mocks.db!.rpc).not.toHaveBeenCalled();
  });

  it("403s a viewer before reading the draft", async () => {
    withDraft();
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("viewer"));
    expect((await post({ assistant_run_id: RUN_ID })).status).toBe(403);
    expect(mocks.db!.calls.some((call) => call.table === "action_runs")).toBe(false);
  });
});
