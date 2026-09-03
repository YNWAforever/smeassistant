import { afterEach, describe, expect, it, vi } from "vitest";

const authorizeWorkspaceRequest = vi.fn();
const from = vi.fn();

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: (...args: unknown[]) => authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => ({ from }) }));

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const URL_BASE = `https://app.test/api/workspaces/${WORKSPACE_ID}/members`;
const PARAMS = { params: Promise.resolve({ workspaceId: WORKSPACE_ID }) };

function auth(role: "owner" | "manager" | "viewer") {
  return {
    ok: true,
    user: { id: "user-1", email: "o@example.com", verified: true },
    membership: { workspaceId: WORKSPACE_ID, workspaceSlug: "demo", userId: "user-1", email: "o@example.com", role, locationScope: null },
  };
}

function post(body: unknown) {
  return import("./route").then(({ POST }) =>
    POST(new Request(URL_BASE, { method: "POST", body: JSON.stringify(body) }), PARAMS),
  );
}

function del(query: string) {
  return import("./route").then(({ DELETE }) => DELETE(new Request(`${URL_BASE}?${query}`), PARAMS));
}

/** The DELETE target-row lookup: `.select().eq().eq().maybeSingle()`, no accepted_at filter. */
function targetRow(role: string | null) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: role ? { role } : null, error: null }),
        }),
      }),
    }),
  };
}

afterEach(() => vi.resetAllMocks());

describe("POST /api/workspaces/[workspaceId]/members", () => {
  it("lets an owner invite a manager and records a member.invited audit event", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    const insert = vi.fn(() => ({
      select: () => ({ single: async () => ({ data: { id: "member-1" }, error: null }) }),
    }));
    const auditInsert = vi.fn(async () => ({ error: null }));
    from.mockImplementation((table: string) => (table === "workspace_members" ? { insert } : { insert: auditInsert }));

    const res = await post({ email: "Teammate@Example.com", role: "manager", locale: "en" });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ memberId: "member-1" });
    expect(authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID }, { minRole: "owner" });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: WORKSPACE_ID, email: "teammate@example.com", role: "manager", invited_by: "user-1" }),
    );
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: WORKSPACE_ID,
        actor_type: "user",
        actor_id: "user-1",
        event: "member.invited",
        entity_type: "workspace_member",
        entity_id: "member-1",
        payload: { locale: "en", role: "manager" },
      }),
    );
  });

  it("refuses anyone below owner (the authorization helper decides) without touching the database", async () => {
    // Upstream let managers invite; here team settings are owner-only
    // (CLAUDE.md §3.9), which authorizeWorkspaceRequest's minRole enforces.
    authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    expect((await post({ email: "teammate@example.com", role: "viewer" })).status).toBe(403);

    authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 401, code: "unauthenticated" });
    expect((await post({ email: "teammate@example.com", role: "viewer" })).status).toBe(401);

    authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 404, code: "not_found" });
    expect((await post({ email: "teammate@example.com", role: "viewer" })).status).toBe(404);
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects inviting as owner", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));

    expect((await post({ email: "teammate@example.com", role: "owner" })).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("409s a duplicate pending invite", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    from.mockImplementation(() => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: "23505" } }) }) }),
    }));

    expect((await post({ email: "teammate@example.com", role: "manager" })).status).toBe(409);
  });

  it("rejects a malformed email", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));

    expect((await post({ email: "not-an-email", role: "manager" })).status).toBe(400);
  });

  it("still 201s when the best-effort audit insert fails", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    from.mockImplementation((table: string) =>
      table === "workspace_members"
        ? { insert: () => ({ select: () => ({ single: async () => ({ data: { id: "member-1" }, error: null }) }) }) }
        : { insert: async () => ({ error: { message: "boom" } }) },
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await post({ email: "teammate@example.com", role: "viewer" })).status).toBe(201);
    consoleError.mockRestore();
  });

  // Note: whether the 23505 also fires for an already-ACCEPTED (not just
  // pending) collision is a property of workspace_members_email_idx_unique
  // (20260823000000_workspace_members_unique_email.sql), not of this route's
  // own logic -- the route only branches on the error code, identically
  // either way.
});

describe("DELETE /api/workspaces/[workspaceId]/members", () => {
  it("lets an owner remove a manager", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    const del_ = vi.fn(async () => ({ error: null }));
    // Two sequenced calls to workspace_members: the target-row lookup
    // (manager) and the actual delete.
    from.mockImplementationOnce(() => targetRow("manager")).mockImplementationOnce(() => ({ delete: () => ({ eq: () => ({ eq: del_ }) }) }));

    expect((await del("memberId=member-2")).status).toBe(200);
    expect(del_).toHaveBeenCalled();
  });

  it("404s a member id that is not on this workspace", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    from.mockImplementationOnce(() => targetRow(null));

    expect((await del("memberId=member-elsewhere")).status).toBe(404);
  });

  it("refuses a non-owner removing the owner row even if the role gate ever loosened", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("manager"));
    from.mockImplementationOnce(() => targetRow("owner"));

    expect((await del("memberId=member-owner")).status).toBe(403);
  });

  it("lets an owner remove a still-pending (not yet accepted) invite", async () => {
    // Regression coverage for the target-row lookup carrying no
    // `.not("accepted_at", "is", null)`: the mock only exposes the bare
    // `.eq().eq().maybeSingle()` chain, so reinstating that filter would throw
    // here instead of returning 200.
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    const del_ = vi.fn(async () => ({ error: null }));
    from.mockImplementationOnce(() => targetRow("manager")).mockImplementationOnce(() => ({ delete: () => ({ eq: () => ({ eq: del_ }) }) }));

    expect((await del("memberId=member-pending")).status).toBe(200);
  });

  it("400s a missing memberId and refuses before the lookup when not authorized", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    expect((await del("")).status).toBe(400);

    authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    expect((await del("memberId=member-2")).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
});
