import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { offerRow } from "@/lib/offers/fixtures.test-helpers";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  workspaces: vi.fn(),
  repo: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), confirm: vi.fn(), archive: vi.fn(), draftCounts: vi.fn() },
  assetGet: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args) };
});
vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/rate-limit")>();
  return { ...actual, enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args) };
});
vi.mock("@/lib/repositories/workspace-read", () => ({ workspaceReadRepository: () => ({ workspaces: mocks.workspaces }) }));
vi.mock("@/lib/repositories/offers", () => ({ offerRepository: () => mocks.repo }));
vi.mock("@/lib/repositories/assets", () => ({ assetRepository: () => ({ get: mocks.assetGet }) }));
vi.mock("@/lib/workspace/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workspace/audit")>();
  return { ...actual, recordNeonEvent: (...args: unknown[]) => mocks.audit(...args), ipHashFor: () => "hash" };
});

const WS = "11111111-1111-4111-8111-111111111111";
const OFFER = "00000000-0000-4000-8000-0000000000a1";
const L1 = "22222222-2222-4222-8222-222222222221";
const L2 = "22222222-2222-4222-8222-222222222222";
const base = `https://app.test/api/workspaces/${WS}/offers`;

function auth(role: "owner" | "manager" | "viewer", locationScope: string[] | null = null) {
  return { ok: true, user: { id: "U1", email: "o@example.test", verified: true }, membership: { workspaceId: WS, workspaceSlug: "w", userId: "U1", email: "o@example.test", role, locationScope } };
}
const listRoute = () => import("./route");
const itemRoute = () => import("./[offerId]/route");
const confirmRoute = () => import("./[offerId]/confirm/route");
const post = (body: unknown) => listRoute().then(({ POST }) => POST(new Request(base, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ workspaceId: WS }) }));
const get = (query = "") => listRoute().then(({ GET }) => GET(new Request(`${base}${query}`), { params: Promise.resolve({ workspaceId: WS }) }));
const patch = (body: unknown, offerId = OFFER) => itemRoute().then(({ PATCH }) => PATCH(new Request(`${base}/${offerId}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ workspaceId: WS, offerId }) }));
const confirm = (body: unknown) => confirmRoute().then(({ POST }) => POST(new Request(`${base}/${OFFER}/confirm`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ workspaceId: WS, offerId: OFFER }) }));

const body = { title: "Lunch set", details: "Soup and main", price_amount: 88, starts_on: "2026-10-05", ends_on: "2026-10-31", locale: "en" };

beforeEach(() => {
  vi.stubEnv("OFFERS_ENABLED", "true");
  mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
  mocks.workspaces.mockResolvedValue([{ id: WS, market: "hk", timezone: "Asia/Hong_Kong" }]);
  mocks.repo.list.mockResolvedValue([offerRow({ workspace_id: WS }), offerRow({ id: "o2", workspace_id: WS, location_id: L2 })]);
  mocks.repo.draftCounts.mockResolvedValue(new Map([[OFFER, 2]]));
  mocks.repo.create.mockImplementation(async (input: Record<string, unknown>) => offerRow({ ...input, workspace_id: WS, status: "draft", confirmed_at: null }));
  mocks.repo.get.mockResolvedValue(offerRow({ workspace_id: WS, status: "draft", confirmed_at: null }));
  mocks.repo.archive.mockResolvedValue(offerRow({ workspace_id: WS, status: "archived", archived_at: "2026-10-02T00:00:00Z" }));
  mocks.repo.confirm.mockResolvedValue("conflict");
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe("offer routes", () => {
  it("are 404 on every method when the flag is off", async () => {
    vi.stubEnv("OFFERS_ENABLED", "1");
    for (const res of [await get(), await post(body), await patch({ archive: true }), await confirm({ expected_revision: 1 })]) expect(res.status).toBe(404);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });
  it("refuse malformed ids", async () => {
    expect((await patch({ archive: true }, "nope")).status).toBe(400);
    const { GET } = await listRoute();
    expect((await GET(new Request(base), { params: Promise.resolve({ workspaceId: "nope" }) })).status).toBe(400);
  });
  it("pass the auth refusal through", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 401, code: "unauthenticated" });
    expect((await get()).status).toBe(401);
  });
  it("let a viewer read but not create", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("viewer"));
    const res = await get();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.offers).toHaveLength(2);
    expect(json.offers[0]).toMatchObject({ priceDisplay: "HK$88", draftCount: 2 });
    expect(json.offers[0]).not.toHaveProperty("created_by");
    expect((await post(body)).status).toBe(403);
  });
  it("refuses a scoped manager's out-of-scope location filter", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue(auth("manager", [L1]));
    expect((await get(`?location=${L2}`)).status).toBe(403);
    expect((await get(`?location=${L1}`)).status).toBe(200);
    expect(mocks.repo.list).toHaveBeenCalledWith(WS, { locationIds: [L1] });
  });
  it("creates a draft and refuses another market's currency", async () => {
    const res = await post(body);
    expect(res.status).toBe(201);
    expect((await res.json()).offer).toMatchObject({ status: "draft", currency: "HKD" });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ event: "offer.created", locale: "en" }));
    const bad = await post({ ...body, currency: "TWD" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "currency_market_mismatch" });
  });
  it("needs expected_revision to edit, and archives without one", async () => {
    expect((await patch({ title: "x" })).status).toBe(400);
    const res = await patch({ archive: true });
    expect(res.status).toBe(200);
    expect((await res.json()).offer.status).toBe("archived");
  });
  it("reports a stale confirm as offer_conflict", async () => {
    mocks.repo.get.mockResolvedValue(offerRow({ workspace_id: WS, status: "draft", confirmed_at: null, revision: 2 }));
    const res = await confirm({ expected_revision: 1 });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "offer_conflict" });
  });
  it("returns 429 when rate limited", async () => {
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    expect((await post(body)).status).toBe(429);
  });
  it("returns 503 without the body when the store fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.repo.create.mockRejectedValue(new Error("boom"));
    const res = await post(body);
    expect(res.status).toBe(503);
    expect(error).toHaveBeenCalledWith(expect.any(String), { category: "offer_create_failed" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("Lunch set");
  });
});
