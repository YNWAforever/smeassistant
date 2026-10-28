import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildSearchBriefs, buildSearchGap } from "@/lib/workspace/search-gap";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), target: vi.fn(), list: vi.fn(), find: vi.fn(), append: vi.fn(), approve: vi.fn(), gsc: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: mocks.auth, inLocationScope: (m: { role: string; locationScope: string[] | null }, id: string) => m.role !== "manager" || m.locationScope === null || m.locationScope.includes(id) }));
vi.mock("@/lib/repositories/conversation-connectors", () => ({ conversationConnectorRepository: () => ({ target: mocks.target }) }));
vi.mock("@/lib/repositories/conversation-search", () => ({ conversationSearchRepository: () => ({ list: mocks.list, find: mocks.find, append: mocks.append, approve: mocks.approve }) }));
vi.mock("@/lib/connectors/gsc", () => ({ readGscContext: mocks.gsc }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: mocks.rate, rateLimitedResponse: () => new Response(null, { status: 429 }) }));
import { GET, POST } from "./route";
const w = "11111111-1111-4111-8111-111111111111", l = "22222222-2222-4222-8222-222222222222", id = "33333333-3333-4333-8333-333333333333", ctx = { params: Promise.resolve({ workspaceId: w }) };
const post = (body: Record<string, unknown>) => POST(new Request("https://app.test/api/search", { method: "POST", body: JSON.stringify({ operation: "read", location_id: l, ...body }) }), ctx);
const get = (location = l) => GET(new Request(`https://app.test/api/search?location_id=${location}`), ctx);
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("CONVERSATION_HOME_ENABLED", "true"); vi.stubEnv("VERCEL_ENV", "preview");
  mocks.auth.mockResolvedValue({ ok: true, user: { id: "owner" }, membership: { workspaceId: w, role: "owner", locationScope: null } });
  mocks.target.mockResolvedValue({ url: "https://saved.example.test/", market: "hk" }); mocks.rate.mockResolvedValue({ allowed: true }); mocks.list.mockResolvedValue([]);
  mocks.gsc.mockResolvedValue({ source: "gsc", status: "disconnected", scope: "", observedAt: null, items: [] });
  mocks.append.mockImplementation(async (scope, gap, brief) => ({ id, ...scope, gap, brief, approvedAt: null, actionId: null }));
});
afterEach(() => vi.unstubAllEnvs());
it("fails closed before auth and all network/storage work in Production or flag OFF", async () => {
  for (const env of ["production", "preview"]) {
    vi.stubEnv("VERCEL_ENV", env); if (env === "preview") vi.stubEnv("CONVERSATION_HOME_ENABLED", "false");
    expect((await get()).status).toBe(404);
    for (const operation of ["read", "approve", "observe"]) expect((await post({ operation, id, confirmed: true })).status).toBe(404);
  }
  expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.gsc).not.toHaveBeenCalled(); expect(mocks.append).not.toHaveBeenCalled(); expect(mocks.approve).not.toHaveBeenCalled();
});
it("rejects all/invalid scopes, duplicate location queries, client sources, URLs, market and draft overrides", async () => {
  for (const location of ["all", "nope"]) { expect((await get(location)).status).toBe(400); expect((await post({ location_id: location })).status).toBe(400); }
  expect((await get(`${l}&location_id=${l}`)).status).toBe(400);
  for (const extra of [{ url: "https://other.test" }, { market: "tw" }, { brief: "fake" }, { source: {} }]) expect((await post(extra)).status).toBe(400);
  expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.gsc).not.toHaveBeenCalled();
});
it("requires accepted membership and enforces owner mutations and persisted workspace/location scope", async () => {
  mocks.auth.mockResolvedValueOnce({ ok: false, code: "unauthenticated", status: 401 }); expect((await get()).status).toBe(401);
  for (const membership of [{ workspaceId: "other", role: "owner", locationScope: null }, { workspaceId: w, role: "manager", locationScope: ["other"] }, { workspaceId: w, role: "viewer", locationScope: null }]) {
    mocks.auth.mockResolvedValue({ ok: true, user: { id: "u" }, membership }); expect((await post({})).status).toBe(403);
  }
  expect(mocks.target).not.toHaveBeenCalled(); expect(mocks.gsc).not.toHaveBeenCalled();
});
it("GET never refreshes Google; reads only the server-saved site with market coverage", async () => {
  expect((await get()).headers.get("cache-control")).toContain("no-store"); expect(mocks.gsc).not.toHaveBeenCalled();
  const response = await post({}); expect(response.status).toBe(201);
  expect(mocks.gsc).toHaveBeenCalledExactlyOnceWith({ workspaceId: w, websiteUrl: "https://saved.example.test/", market: "hk", marketOnly: true });
  expect((await response.json()).record).toMatchObject({ brief: null, approvedAt: null, gap: { status: "unavailable", queries: [] } });
  expect(mocks.approve).not.toHaveBeenCalled();
});
it("approval requires the explicit literal confirmation and uses only a server saved ID", async () => {
  for (const confirmed of [undefined, false, "true"]) expect((await post({ operation: "approve", id, ...(confirmed === undefined ? {} : { confirmed }) })).status).toBe(400);
  expect(mocks.approve).not.toHaveBeenCalled();
  mocks.approve.mockResolvedValue({ id, approvedAt: "2026-10-28", actionId: "task" });
  expect((await post({ operation: "approve", id, confirmed: true })).status).toBe(200);
  expect(mocks.approve).toHaveBeenCalledExactlyOnceWith({ workspaceId: w, locationId: l }, id, "owner"); expect(mocks.gsc).not.toHaveBeenCalled();
  mocks.approve.mockResolvedValue(null); expect((await post({ operation: "approve", id, confirmed: true })).status).toBe(404);
});
it("observe rejects missing, wrong-scope or unapproved IDs without upstream calls; no comparable source means empty", async () => {
  mocks.find.mockResolvedValue(null); expect((await post({ operation: "observe", id })).status).toBe(404);
  mocks.find.mockResolvedValue({ approvedAt: null }); expect((await post({ operation: "observe", id })).status).toBe(409); expect(mocks.gsc).not.toHaveBeenCalled();
  const gap = buildSearchGap({ market: "hk", websiteUrl: null, requestedAt: new Date().toISOString(), source: { source: "gsc", status: "empty", scope: "", items: [], observedAt: null } });
  mocks.find.mockResolvedValue({ gap, brief: buildSearchBriefs(gap), approvedAt: "2026-10-28T00:00:00Z", actionId: "task" });
  const response = await post({ operation: "observe", id }); expect((await response.json()).observation).toEqual({ status: "empty", reason: "baseline_missing", rows: [] });
  expect(mocks.append).not.toHaveBeenCalled(); expect(mocks.approve).not.toHaveBeenCalled();
});
it("rate limits and missing target fail before provider calls; errors do not fabricate data", async () => {
  mocks.target.mockResolvedValueOnce(null); expect((await post({})).status).toBe(404);
  mocks.rate.mockResolvedValueOnce({ allowed: false }); expect((await post({})).status).toBe(429); expect(mocks.gsc).not.toHaveBeenCalled();
  mocks.gsc.mockRejectedValue(new Error("outage")); expect((await post({})).status).toBe(503); expect(mocks.append).not.toHaveBeenCalled();
});
