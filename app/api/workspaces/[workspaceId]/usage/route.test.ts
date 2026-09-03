import { afterEach, describe, expect, it, vi } from "vitest";

const authorizeWorkspaceRequest = vi.fn();
const from = vi.fn();

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: (...args: unknown[]) => authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => ({ from }) }));

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const VIEWER = { ok: true, user: { id: "u1", email: "v@example.com", verified: true }, membership: { workspaceId: WORKSPACE_ID, workspaceSlug: "demo", userId: "u1", email: "v@example.com", role: "viewer", locationScope: null } };

function get(workspaceId = WORKSPACE_ID) {
  return import("./route").then(({ GET }) =>
    GET(new Request(`https://app.test/api/workspaces/${workspaceId}/usage`), { params: Promise.resolve({ workspaceId }) }),
  );
}

function tables({ tier, usage }: { tier: string; usage: Record<string, unknown> | null }) {
  const insert = vi.fn(async () => ({ error: null }));
  let reads = 0;
  from.mockImplementation((table: string) => {
    if (table === "workspaces") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { tier, timezone: "Asia/Hong_Kong" }, error: null }) }) }) };
    if (table === "workspace_usage") {
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: reads++ === 0 ? usage : usage ?? { period: "2026-09", approved_deliveries: 0, allowance: 3 }, error: null }) }) }) }),
        insert,
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { insert };
}

afterEach(() => vi.resetAllMocks());

describe("GET /api/workspaces/[workspaceId]/usage", () => {
  it("returns the current period row for any member", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(VIEWER);
    const { insert } = tables({ tier: "paid", usage: { period: "2026-09", approved_deliveries: 2, allowance: null } });
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ period: "2026-09", approved_deliveries: 2, allowance: null, tier: "paid" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates the row lazily with the tier's allowance when missing", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(VIEWER);
    const { insert } = tables({ tier: "lite", usage: null });
    const res = await get();
    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: WORKSPACE_ID, allowance: 3 }));
    expect(await res.json()).toMatchObject({ approved_deliveries: 0, allowance: 3, tier: "lite" });
  });

  it("propagates the auth status", async () => {
    authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 401, code: "unauthenticated" });
    expect((await get()).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a malformed workspace id", async () => {
    expect((await get("nope")).status).toBe(400);
  });
});
