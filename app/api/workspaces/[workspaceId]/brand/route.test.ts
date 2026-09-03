import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  getBrand: vi.fn(),
  putBrand: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/rate-limit")>();
  return { ...actual, enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args) };
});
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => ({ marker: "db" }) }));
vi.mock("@/lib/workspace/brand", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workspace/brand")>();
  return { ...actual, getBrand: (...args: unknown[]) => mocks.getBrand(...args), putBrand: (...args: unknown[]) => mocks.putBrand(...args) };
});

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const URL_BASE = `https://app.test/api/workspaces/${WORKSPACE_ID}/brand`;
const PARAMS = { params: Promise.resolve({ workspaceId: WORKSPACE_ID }) };

function auth(role: "owner" | "manager" | "viewer") {
  return {
    ok: true,
    user: { id: "user-1", email: "o@example.com", verified: true },
    membership: { workspaceId: WORKSPACE_ID, workspaceSlug: "demo", userId: "user-1", email: "o@example.com", role, locationScope: null },
  };
}

const brand = { workspaceId: WORKSPACE_ID, voice: "warm", approvedClaims: [], prohibitedTerms: [], languages: ["zh-HK"], facts: {}, updatedAt: null };
const body = { voice: "playful", approved_claims: ["Family-run"], prohibited_terms: [], languages: ["zh-HK", "en"], facts: { since: "1998" }, locale: "en" };

function get() {
  return import("./route").then(({ GET }) => GET(new Request(URL_BASE), PARAMS));
}
function put(payload: unknown) {
  return import("./route").then(({ PUT }) => PUT(new Request(URL_BASE, { method: "PUT", body: JSON.stringify(payload) }), PARAMS));
}

beforeEach(() => {
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
  mocks.getBrand.mockResolvedValue(brand);
  mocks.putBrand.mockResolvedValue({ ...brand, voice: "playful" });
});

afterEach(() => vi.resetAllMocks());

describe("GET /api/workspaces/[workspaceId]/brand", () => {
  it("returns the profile to any accepted member", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("viewer"));
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ brand });
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID });
  });

  it("passes the auth helper's refusal through", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 401, code: "unauthenticated" });
    expect((await get()).status).toBe(401);
    expect(mocks.getBrand).not.toHaveBeenCalled();
  });
});

describe("PUT /api/workspaces/[workspaceId]/brand", () => {
  it("lets the owner save: validated body, per-user limiter, audit via putBrand", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    const res = await put(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ brand: { ...brand, voice: "playful" } });
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID }, { minRole: "owner" });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ scope: "brand_update", identifiers: ["user-1"], failClosed: true }));
    expect(mocks.putBrand).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        actorId: "user-1",
        locale: "en",
        brand: { voice: "playful", approved_claims: ["Family-run"], prohibited_terms: [], languages: ["zh-HK", "en"], facts: { since: "1998" } },
      }),
    );
  });

  it("is owner-only: the auth helper's 403 is returned before any write", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    expect((await put(body)).status).toBe(403);
    expect(mocks.putBrand).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });

  it("400s an invalid body and 429s past the limiter", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    expect((await put({ ...body, voice: "loud" })).status).toBe(400);
    expect(mocks.putBrand).not.toHaveBeenCalled();
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    expect((await put(body)).status).toBe(429);
  });

  it("503s when the save fails", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    mocks.putBrand.mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await put(body)).status).toBe(503);
    spy.mockRestore();
  });
});
