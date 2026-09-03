import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  buildConsentUrl: vi.fn((state: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`),
  signState: vi.fn(() => "signed-state"),
  googleOAuthConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => ({ from: mocks.from }) }));
vi.mock("@/lib/oauth/google-connection", () => ({
  buildConsentUrl: mocks.buildConsentUrl,
  signState: mocks.signState,
  googleOAuthConfigured: mocks.googleOAuthConfigured,
}));

import { GET } from "./route";

function request(query = ""): Request {
  return new Request(`https://scanner.test/api/oauth/google/start${query}`);
}

/**
 * A chainable membership query: every filter returns the same builder and the
 * terminal `.limit()` resolves the rows. `eqCalls` records the filters so a
 * test can pin that `?workspace=` narrows the lookup by workspace id.
 */
function membershipTable(rows: Array<{ workspace_id: string; role: string; created_at: string }>) {
  const eqCalls: Array<[string, string]> = [];
  const builder = {
    select: () => builder,
    eq: (column: string, value: string) => {
      eqCalls.push([column, value]);
      return builder;
    },
    not: () => builder,
    order: () => builder,
    limit: async () => ({ data: rows, error: null }),
  };
  return { builder, eqCalls };
}

describe("GET /api/oauth/google/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.googleOAuthConfigured.mockReturnValue(true);
  });

  it("returns 503 rather than throwing when the client is unconfigured", async () => {
    // googleOAuthConfigured() is checked before any Supabase call, so an
    // unconfigured client must degrade to a plain 503 "unavailable" — nothing
    // else in the product depends on a GBP token yet, so this must not 500.
    mocks.googleOAuthConfigured.mockReturnValue(false);
    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("401s an unauthenticated visitor", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(request())).status).toBe(401);
  });

  it("refuses a viewer and a caller with no membership", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "v@example.com" } } });
    mocks.from.mockImplementation(() => membershipTable([{ workspace_id: "ws-1", role: "viewer", created_at: "2026-01-01" }]).builder);
    expect((await GET(request())).status).toBe(403);

    mocks.from.mockImplementation(() => membershipTable([]).builder);
    expect((await GET(request())).status).toBe(403);
    expect(mocks.signState).not.toHaveBeenCalled();
  });

  it("signs the oldest membership's workspace with the requested locale", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "o@example.com" } } });
    mocks.from.mockImplementation(() => membershipTable([{ workspace_id: "ws-1", role: "owner", created_at: "2026-01-01" }]).builder);

    const response = await GET(request("?locale=zh-TW"));

    expect(response.status).toBe(307);
    expect(mocks.signState).toHaveBeenCalledWith("ws-1", undefined, "zh-TW");
    expect(response.headers.get("location")).toContain("state=signed-state");
  });

  it("falls back to the default locale when the requested one is unsupported", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "o@example.com" } } });
    mocks.from.mockImplementation(() => membershipTable([{ workspace_id: "ws-1", role: "manager", created_at: "2026-01-01" }]).builder);

    await GET(request("?locale=fr"));

    expect(mocks.signState).toHaveBeenCalledWith("ws-1", undefined, "zh-HK");
  });

  it("narrows the membership lookup to the named workspace slug", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "o@example.com" } } });
    const members = membershipTable([{ workspace_id: "ws-2", role: "owner", created_at: "2026-02-01" }]);
    mocks.from.mockImplementation((table: string) => {
      if (table === "workspaces") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "ws-2" }, error: null }) }) }) };
      }
      return members.builder;
    });

    const response = await GET(request("?workspace=second-shop&locale=en"));

    expect(response.status).toBe(307);
    expect(members.eqCalls).toContainEqual(["workspace_id", "ws-2"]);
    expect(mocks.signState).toHaveBeenCalledWith("ws-2", undefined, "en");
  });

  it("403s a named workspace that does not exist without leaking whether the slug is taken", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "o@example.com" } } });
    mocks.from.mockImplementation(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }));

    const response = await GET(request("?workspace=not-mine"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "no_workspace" });
    expect(mocks.signState).not.toHaveBeenCalled();
  });

  it("400s a malformed workspace slug before touching Supabase", async () => {
    const response = await GET(request(`?workspace=${encodeURIComponent("../evil")}`));
    expect(response.status).toBe(400);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});
