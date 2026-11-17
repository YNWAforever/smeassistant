import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  buildInstagramConsentUrl: vi.fn((state: string) => `https://www.facebook.com/v23.0/dialog/oauth?state=${state}`),
  signInstagramState: vi.fn(() => "signed-instagram-state"),
  instagramOAuthEnabled: vi.fn(() => true),
  instagramOAuthConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/auth", () => ({ getUser: async () => { const response = await mocks.getUser(); const user = response?.data?.user; return user ? { ...user, verified: true } : null; } }));
vi.mock("@/lib/repositories/membership", () => ({ membershipRepository: {
  workspace: async (ref: { slug?: string; id?: string }) => { const r = await mocks.from("workspaces").select().eq(ref.slug ? "slug" : "id", ref.slug ?? ref.id).maybeSingle(); if (r.error) throw r.error; return r.data; },
  accepted: async (user: string, ws: string) => { const r = await mocks.from("workspace_members").select().eq("user_id", user).eq("workspace_id", ws).not("accepted_at", "is", null).order("created_at").limit(1); if (r.error) throw r.error; return r.data?.[0] ?? null; },
  listAccepted: async (user: string) => { const r = await mocks.from("workspace_members").select().eq("user_id", user).not("accepted_at", "is", null).order("created_at").limit(1); if (r.error) throw r.error; return r.data; },
} }));
vi.mock("@/lib/oauth/instagram-connection", () => ({
  buildInstagramConsentUrl: mocks.buildInstagramConsentUrl,
  signInstagramState: mocks.signInstagramState,
  instagramOAuthEnabled: mocks.instagramOAuthEnabled,
  instagramOAuthConfigured: mocks.instagramOAuthConfigured,
}));

import { GET } from "./route";

function request(query = ""): Request {
  return new Request(`https://scanner.test/api/oauth/instagram/start${query}`);
}

/** A chainable membership query: terminal `.limit()`/`.maybeSingle()` resolves rows. */
function membershipTable(rows: Array<{ workspace_id: string; role: string; created_at: string }>) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    not: () => builder,
    order: () => builder,
    limit: async () => ({ data: rows, error: null }),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
  };
  return builder;
}

describe("GET /api/oauth/instagram/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.instagramOAuthEnabled.mockReturnValue(true);
    mocks.instagramOAuthConfigured.mockReturnValue(true);
  });

  it("answers 404 not_enabled while the flag is off, before any session read", async () => {
    // The flag is the release switch (Phase 20 P20.1): without it the route
    // must not even look at the session or Meta configuration.
    mocks.instagramOAuthEnabled.mockReturnValue(false);
    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_enabled" });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("answers 503 rather than throwing when the app is half configured", async () => {
    mocks.instagramOAuthConfigured.mockReturnValue(false);
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
    mocks.from.mockImplementation(() => membershipTable([{ workspace_id: "ws-1", role: "viewer", created_at: "2026-01-01" }]));
    expect((await GET(request())).status).toBe(403);

    mocks.from.mockImplementation(() => membershipTable([]));
    expect((await GET(request())).status).toBe(403);
    expect(mocks.signInstagramState).not.toHaveBeenCalled();
  });

  it("signs the selected workspace with the requested locale and redirects to Meta", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "o@example.com" } } });
    mocks.from.mockImplementation(() => membershipTable([{ workspace_id: "ws-1", role: "owner", created_at: "2026-01-01" }]));

    const response = await GET(request("?workspace=demo-cafe&locale=zh-TW"));

    expect(response.status).toBe(307);
    expect(mocks.signInstagramState).toHaveBeenCalledWith("ws-1", undefined, "zh-TW");
    expect(response.headers.get("location")).toContain("state=signed-instagram-state");
  });

  it("rejects a malformed workspace selector before reading the session", async () => {
    const response = await GET(request("?workspace=Not A Slug!"));
    expect(response.status).toBe(400);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});
