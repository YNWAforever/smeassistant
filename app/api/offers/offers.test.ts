import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeLike, LOCATION_ID, WORKSPACE_ID } from "@/app/api/actions/_shared/test-db";
import { OfferError, type Offer, type OfferErrorCode } from "@/lib/workspace/offers";

const L1 = LOCATION_ID;
const L2 = "33333333-3333-4333-8333-333333333333";
const OFFER_ID = "55555555-5555-4555-8555-555555555555";
const ASSET_ID = "44444444-4444-4444-8444-444444444444";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  recordNeonEvent: vi.fn(),
  offers: {
    scope: vi.fn(),
    update: vi.fn(),
    confirm: vi.fn(),
    archive: vi.fn(),
  },
  artifacts: {
    assistantWorkspace: vi.fn(),
    assistantLocations: vi.fn(),
  },
  assets: { get: vi.fn() },
}));

vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args),
}));
vi.mock("@/lib/repositories/offers", () => ({ offerRepository: () => mocks.offers }));
vi.mock("@/lib/repositories/artifacts", async (original) => ({
  ...(await original<typeof import("@/lib/repositories/artifacts")>()),
  artifactRepository: () => mocks.artifacts,
}));
vi.mock("@/lib/repositories/assets", () => ({ assetRepository: () => mocks.assets }));
vi.mock("@/lib/security/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/security/rate-limit")>()),
  enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args),
}));
vi.mock("@/lib/workspace/audit", async (original) => ({
  ...(await original<typeof import("@/lib/workspace/audit")>()),
  recordNeonEvent: (...args: unknown[]) => mocks.recordNeonEvent(...args),
  ipHashFor: () => "hash",
}));

const ctx = { params: Promise.resolve({ offerId: OFFER_ID }) };

function offer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: OFFER_ID,
    workspaceId: WORKSPACE_ID,
    locationId: L1,
    title: "Lunch set",
    details: "Soup and a main",
    terms: "",
    priceAmount: 88,
    currency: "HKD",
    validFrom: "2026-10-01",
    validUntil: "2026-10-31",
    claims: [],
    prohibitedTerms: [],
    assetId: null,
    status: "draft",
    revision: 3,
    confirmedAt: null,
    expired: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const patchBody = {
  expected_revision: 2,
  title: "Lunch set",
  details: "Soup and a main",
  price_amount: 88,
  currency: "HKD",
  valid_from: "2026-10-01",
  valid_until: "2026-10-31",
  location_id: L1,
};

const request = (method: string, body?: unknown) =>
  new Request("https://app.test/api/offers/x", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const patch = (body: unknown) => import("./[offerId]/route").then(({ PATCH }) => PATCH(request("PATCH", body), ctx));
const confirm = (body: unknown) => import("./[offerId]/confirm/route").then(({ POST }) => POST(request("POST", body), ctx));
const archive = () => import("./[offerId]/archive/route").then(({ POST }) => POST(request("POST"), ctx));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OFFER_PROMOTIONS_ENABLED", "true");
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
  mocks.offers.scope.mockResolvedValue({ offerId: OFFER_ID, workspaceId: WORKSPACE_ID, locationId: L1 });
  mocks.offers.update.mockResolvedValue({ kind: "updated", offer: offer({ revision: 3 }), changed: ["title"], cancelledActions: 0 });
  mocks.offers.confirm.mockResolvedValue({ kind: "confirmed", revision: 3 });
  mocks.offers.archive.mockResolvedValue({ kind: "archived", cancelledActions: 2 });
  mocks.artifacts.assistantWorkspace.mockResolvedValue({ id: WORKSPACE_ID, market: "hk" });
  mocks.artifacts.assistantLocations.mockResolvedValue([{ id: L1 }, { id: L2 }]);
  mocks.assets.get.mockResolvedValue(null);
});

afterEach(() => vi.unstubAllEnvs());

describe("flag, ids and authorization (all three handlers)", () => {
  it("answers 404 on every handler when the flag is off, before any lookup", async () => {
    vi.stubEnv("OFFER_PROMOTIONS_ENABLED", "1");
    expect((await patch(patchBody)).status).toBe(404);
    expect((await confirm({ expected_revision: 1 })).status).toBe(404);
    expect((await archive()).status).toBe(404);
    expect(mocks.offers.scope).not.toHaveBeenCalled();
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("answers 400 on an invalid offer id", async () => {
    const bad = { params: Promise.resolve({ offerId: "nope" }) };
    expect((await (await import("./[offerId]/route")).PATCH(request("PATCH", patchBody), bad)).status).toBe(400);
    expect((await (await import("./[offerId]/confirm/route")).POST(request("POST", { expected_revision: 1 }), bad)).status).toBe(400);
    expect((await (await import("./[offerId]/archive/route")).POST(request("POST"), bad)).status).toBe(400);
    expect(mocks.offers.scope).not.toHaveBeenCalled();
  });

  it("answers 404 for an offer that does not exist, before authorizing", async () => {
    mocks.offers.scope.mockResolvedValue(null);
    expect((await patch(patchBody)).status).toBe(404);
    expect((await confirm({ expected_revision: 1 })).status).toBe(404);
    expect((await archive()).status).toBe(404);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("authorizes against the stored offer's workspace, never one the caller names", async () => {
    await confirm({ expected_revision: 1, workspace_id: "99999999-9999-4999-8999-999999999999" });
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID }, { minRole: "manager" });
  });

  it("returns the status authorizeWorkspaceRequest gives a non-member", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    expect((await patch(patchBody)).status).toBe(403);
    expect((await confirm({ expected_revision: 1 })).status).toBe(403);
    expect((await archive()).status).toBe(403);
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 401, code: "unauthenticated" });
    expect((await archive()).status).toBe(401);
    expect(mocks.offers.update).not.toHaveBeenCalled();
    expect(mocks.offers.confirm).not.toHaveBeenCalled();
    expect(mocks.offers.archive).not.toHaveBeenCalled();
  });

  it("refuses a viewer on every handler", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("viewer"));
    expect((await patch(patchBody)).status).toBe(403);
    expect((await confirm({ expected_revision: 1 })).status).toBe(403);
    expect((await archive()).status).toBe(403);
  });

  it("refuses a manager scoped away from the offer's location, and lets an in-scope one through", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [L2]));
    expect((await patch(patchBody)).status).toBe(403);
    expect((await confirm({ expected_revision: 1 })).status).toBe(403);
    expect((await archive()).status).toBe(403);
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [L1]));
    expect((await confirm({ expected_revision: 1 })).status).toBe(200);
    expect((await archive()).status).toBe(200);
  });

  it("refuses any manager a workspace-wide offer", async () => {
    mocks.offers.scope.mockResolvedValue({ offerId: OFFER_ID, workspaceId: WORKSPACE_ID, locationId: null });
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", null));
    expect((await patch({ ...patchBody, location_id: null })).status).toBe(403);
    expect((await confirm({ expected_revision: 1 })).status).toBe(403);
    expect((await archive()).status).toBe(403);
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
    expect((await archive()).status).toBe(200);
  });

  it("answers 429 from the rate limiter before any write", async () => {
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    expect((await patch(patchBody)).status).toBe(429);
    expect((await confirm({ expected_revision: 1 })).status).toBe(429);
    expect((await archive()).status).toBe(429);
    expect(mocks.offers.update).not.toHaveBeenCalled();
    expect(mocks.offers.confirm).not.toHaveBeenCalled();
    expect(mocks.offers.archive).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ scope: "action_mutation", failClosed: true }));
  });
});

describe("PATCH /api/offers/[offerId]", () => {
  it("updates and records offer.updated with only the changed fields and the new revision", async () => {
    mocks.offers.update.mockResolvedValue({ kind: "updated", offer: offer({ revision: 3 }), changed: ["title", "valid_until"], cancelledActions: 0 });
    const res = await patch(patchBody);
    expect(res.status).toBe(200);
    expect((await res.json()).offer.revision).toBe(3);
    expect(mocks.offers.update).toHaveBeenCalledWith(WORKSPACE_ID, OFFER_ID, 2, expect.objectContaining({ title: "Lunch set" }));
    expect(mocks.recordNeonEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "offer.updated",
        entityId: OFFER_ID,
        payload: { changed: ["title", "valid_until"], revision: 3, cancelled_actions: 0 },
      }),
    );
  });

  it("records how many open actions a relocation cancelled (F1)", async () => {
    mocks.offers.update.mockResolvedValue({ kind: "updated", offer: offer({ revision: 3 }), changed: ["location_id"], cancelledActions: 2 });
    expect((await patch(patchBody)).status).toBe(200);
    expect(mocks.recordNeonEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "offer.updated", payload: { changed: ["location_id"], revision: 3, cancelled_actions: 2 } }),
    );
  });

  it("answers 200 with the unchanged offer and records no audit row when nothing changed (F5)", async () => {
    mocks.offers.update.mockResolvedValue({ kind: "updated", offer: offer({ revision: 2 }), changed: [], cancelledActions: 0 });
    const res = await patch(patchBody);
    expect(res.status).toBe(200);
    expect((await res.json()).offer.revision).toBe(2);
    expect(mocks.recordNeonEvent).not.toHaveBeenCalled();
  });

  it("requires an integer expected_revision", async () => {
    const { expected_revision: _omitted, ...without } = patchBody;
    void _omitted;
    expect((await patch(without)).status).toBe(400);
    expect((await patch({ ...patchBody, expected_revision: 0 })).status).toBe(400);
    expect((await patch({ ...patchBody, expected_revision: 1.5 })).status).toBe(400);
    expect((await patch({ ...patchBody, expected_revision: "2" })).status).toBe(400);
    expect(mocks.offers.update).not.toHaveBeenCalled();
  });

  it("answers 409 offer_revision_changed for a stale revision, with no audit row", async () => {
    mocks.offers.update.mockResolvedValue({ kind: "revision_changed" });
    const res = await patch(patchBody);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("offer_revision_changed");
    expect(mocks.recordNeonEvent).not.toHaveBeenCalled();
  });

  it("answers 409 offer_archived for an archived offer", async () => {
    mocks.offers.update.mockResolvedValue({ kind: "archived" });
    const res = await patch(patchBody);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("offer_archived");
  });

  it("answers 404 when the offer vanished between the scope read and the update", async () => {
    mocks.offers.update.mockResolvedValue({ kind: "not_found" });
    expect((await patch(patchBody)).status).toBe(404);
  });

  it("rejects an invalid body and a currency outside the workspace market with 400", async () => {
    expect((await patch({ ...patchBody, valid_until: "2026-09-01" })).status).toBe(400);
    expect((await patch({ ...patchBody, currency: "TWD" })).status).toBe(400);
    expect(mocks.offers.update).not.toHaveBeenCalled();
  });

  it("authorizes the body's new location too (R9): a manager cannot move an offer out of scope or widen it", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [L1]));
    expect((await patch({ ...patchBody, location_id: L2 })).status).toBe(403);
    expect((await patch({ ...patchBody, location_id: null })).status).toBe(403);
    expect(mocks.offers.update).not.toHaveBeenCalled();
    expect((await patch({ ...patchBody, location_id: L1 })).status).toBe(200);
  });

  it("rejects a new location outside the workspace with 400", async () => {
    mocks.artifacts.assistantLocations.mockResolvedValue([{ id: L1 }]);
    expect((await patch({ ...patchBody, location_id: L2 })).status).toBe(400);
    expect(mocks.offers.update).not.toHaveBeenCalled();
  });

  it("rejects an asset from another location with 400", async () => {
    mocks.assets.get.mockResolvedValue({ id: ASSET_ID, location_id: L2, rights_status: "approved" });
    const res = await patch({ ...patchBody, asset_id: ASSET_ID });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("asset_id is invalid");
    expect(mocks.offers.update).not.toHaveBeenCalled();
  });

  it("accepts an approved asset usable at the new location", async () => {
    mocks.assets.get.mockResolvedValue({ id: ASSET_ID, location_id: L1, rights_status: "approved" });
    expect((await patch({ ...patchBody, asset_id: ASSET_ID })).status).toBe(200);
  });
});

describe("POST /api/offers/[offerId]/confirm", () => {
  it("confirms against the expected revision and returns the SQL result without a route-side audit row", async () => {
    const res = await confirm({ expected_revision: 3 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: "confirmed", revision: 3 });
    expect(mocks.offers.confirm).toHaveBeenCalledWith(OFFER_ID, expect.any(String), 3);
    expect(mocks.recordNeonEvent).not.toHaveBeenCalled();
  });

  it("requires an expected_revision", async () => {
    expect((await confirm({})).status).toBe(400);
    expect(mocks.offers.confirm).not.toHaveBeenCalled();
  });

  it.each<[OfferErrorCode, number]>([
    ["offer_incomplete", 422],
    ["offer_currency_market", 422],
    ["offer_revision_changed", 409],
    ["offer_archived", 409],
    ["offer_expired", 409],
    ["offer_not_found", 404],
  ])("maps %s to %i", async (code, status) => {
    mocks.offers.confirm.mockRejectedValue(new OfferError(code));
    const res = await confirm({ expected_revision: 3 });
    expect(res.status).toBe(status);
    expect((await res.json()).error).toBe(code);
  });

  it("answers 503 on an unexpected failure and never leaks its message", async () => {
    mocks.offers.confirm.mockRejectedValue(new Error("connection string leaked"));
    const res = await confirm({ expected_revision: 3 });
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("leaked");
  });
});

describe("POST /api/offers/[offerId]/archive", () => {
  it("archives and reports how many open actions it cancelled", async () => {
    const res = await archive();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: "archived", cancelledActions: 2 });
    expect(mocks.offers.archive).toHaveBeenCalledWith(OFFER_ID, expect.any(String));
    expect(mocks.recordNeonEvent).not.toHaveBeenCalled();
  });

  it("is idempotent: an already archived offer is still 200", async () => {
    mocks.offers.archive.mockResolvedValue({ kind: "already-archived", cancelledActions: 0 });
    const res = await archive();
    expect(res.status).toBe(200);
    expect((await res.json()).kind).toBe("already-archived");
  });

  it("maps an OfferError from the SQL function", async () => {
    mocks.offers.archive.mockRejectedValue(new OfferError("offer_not_found"));
    expect((await archive()).status).toBe(404);
  });
});
