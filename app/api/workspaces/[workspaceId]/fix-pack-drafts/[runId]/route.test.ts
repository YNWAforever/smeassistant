import { afterEach, describe, expect, it, vi } from "vitest";

const authorizeWorkspaceRequest = vi.fn();
const from = vi.fn();

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: (...args: unknown[]) => authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => ({ from }) }));

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";

function auth(role: string) {
  return {
    ok: true,
    user: { id: "user-1", email: "u@example.com", verified: true },
    membership: { workspaceId: WORKSPACE_ID, workspaceSlug: "demo", userId: "user-1", email: "u@example.com", role, locationScope: null },
  };
}

function patch(body: unknown) {
  return import("./route").then(({ PATCH }) =>
    PATCH(
      new Request(`https://app.test/api/workspaces/${WORKSPACE_ID}/fix-pack-drafts/${RUN_ID}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ workspaceId: WORKSPACE_ID, runId: RUN_ID }) },
    ),
  );
}

/** agent_runs mock: run lookup (select...maybeSingle) + conditional update. */
function runsTable({ runWorkspaceId, updatedRows = [{ id: RUN_ID }] }: { runWorkspaceId: string | null; updatedRows?: unknown[] }) {
  const update = vi.fn(() => ({
    eq: () => ({
      eq: () => ({ select: async () => ({ data: updatedRows, error: null }) }),
    }),
  }));
  from.mockImplementation((table: string) => {
    if (table !== "agent_runs") throw new Error(`unexpected table ${table}`);
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: runWorkspaceId === null ? null : { job_id: "job-1", audit_jobs: { workspace_id: runWorkspaceId } },
            error: null,
          }),
        }),
      }),
      update,
    };
  });
  return { update };
}

afterEach(() => vi.resetAllMocks());

describe("PATCH /api/workspaces/[workspaceId]/fix-pack-drafts/[runId]", () => {
  it("lets an owner approve a pending draft and stamps the reviewer", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    const { update } = runsTable({ runWorkspaceId: WORKSPACE_ID });

    const res = await patch({ status: "approved" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID }, { minRole: "manager" });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "approved", reviewed_by: "user-1" }));
  });

  it("lets a manager reject a pending draft", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("manager"));
    runsTable({ runWorkspaceId: WORKSPACE_ID });

    expect((await patch({ status: "rejected" })).status).toBe(200);
  });

  it("refuses a viewer (authorizeWorkspaceRequest decides) without reading the run", async () => {
    authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });

    expect((await patch({ status: "approved" })).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("404s a run belonging to a different workspace, same as a nonexistent run", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    runsTable({ runWorkspaceId: "99999999-9999-4999-8999-999999999999" });
    expect((await patch({ status: "approved" })).status).toBe(404);

    runsTable({ runWorkspaceId: null });
    expect((await patch({ status: "approved" })).status).toBe(404);
  });

  it("409s a draft that was already reviewed", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    runsTable({ runWorkspaceId: WORKSPACE_ID, updatedRows: [] });

    expect((await patch({ status: "approved" })).status).toBe(409);
  });

  it("rejects a bad status value", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));

    expect((await patch({ status: "draft" })).status).toBe(400);
    expect((await patch({ status: "delivered" })).status).toBe(400);
  });
});
