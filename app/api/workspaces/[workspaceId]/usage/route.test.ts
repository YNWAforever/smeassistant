import { afterEach, describe, expect, it, vi } from "vitest";

const authorizeWorkspaceRequest = vi.fn();
const workspaces = vi.fn(),
  usage = vi.fn();

vi.mock("@/lib/auth", () => ({
  authorizeWorkspaceRequest: (...args: unknown[]) =>
    authorizeWorkspaceRequest(...args),
}));
vi.mock("@/lib/repositories/workspace-read", () => ({
  workspaceReadRepository: () => ({ workspaces, usage }),
}));

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const VIEWER = {
  ok: true,
  user: { id: "u1", email: "v@example.com", verified: true },
  membership: {
    workspaceId: WORKSPACE_ID,
    workspaceSlug: "demo",
    userId: "u1",
    email: "v@example.com",
    role: "viewer",
    locationScope: null,
  },
};

function get(workspaceId = WORKSPACE_ID) {
  return import("./route").then(({ GET }) =>
    GET(new Request(`https://app.test/api/workspaces/${workspaceId}/usage`), {
      params: Promise.resolve({ workspaceId }),
    }),
  );
}

function tables(input: {
  tier: string;
  usage: Record<string, unknown> | null;
}) {
  workspaces.mockResolvedValue([
    { tier: input.tier, timezone: "Asia/Hong_Kong" },
  ]);
  usage.mockImplementation(
    async (_workspace: string, period: string, allowance: number | null) =>
      input.usage ?? { period, approved_deliveries: 0, allowance },
  );
  return { insert: usage };
}

afterEach(() => vi.resetAllMocks());

describe("GET /api/workspaces/[workspaceId]/usage", () => {
  it("returns the current period row for any member", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(VIEWER);
    const { insert } = tables({
      tier: "paid",
      usage: { period: "2026-09", approved_deliveries: 2, allowance: null },
    });
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      period: "2026-09",
      approved_deliveries: 2,
      allowance: null,
      tier: "paid",
    });
    expect(insert).toHaveBeenCalledWith(WORKSPACE_ID, expect.any(String), null);
  });

  it("creates the row lazily with the tier's allowance when missing", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(VIEWER);
    const { insert } = tables({ tier: "lite", usage: null });
    const res = await get();
    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(WORKSPACE_ID, expect.any(String), 3);
    expect(await res.json()).toMatchObject({
      approved_deliveries: 0,
      allowance: 3,
      tier: "lite",
    });
  });

  it("propagates the auth status", async () => {
    authorizeWorkspaceRequest.mockResolvedValue({
      ok: false,
      status: 401,
      code: "unauthenticated",
    });
    expect((await get()).status).toBe(401);
    expect(workspaces).not.toHaveBeenCalled();
  });

  it("rejects a malformed workspace id", async () => {
    expect((await get("nope")).status).toBe(400);
  });
});
