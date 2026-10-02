import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeLike, LOCATION_ID, WORKSPACE_ID } from "@/app/api/actions/_shared/test-db";
import type { Offer } from "@/lib/workspace/offers";

const L1 = LOCATION_ID;
const L2 = "33333333-3333-4333-8333-333333333333";
const ASSET_ID = "44444444-4444-4444-8444-444444444444";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  recordNeonEvent: vi.fn(),
  offers: {
    list: vi.fn(),
    create: vi.fn(),
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

const ctx = { params: Promise.resolve({ workspaceId: WORKSPACE_ID }) };

function offer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    workspaceId: WORKSPACE_ID,
    locationId: null,
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
    revision: 1,
    confirmedAt: null,
    expired: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const validBody = {
  title: "Lunch set",
  details: "Soup and a main",
  price_amount: 88,
  currency: "HKD",
  valid_from: "2026-10-01",
  valid_until: "2026-10-31",
  location_id: L1,
};

const get = () => import("./route").then(({ GET }) => GET(new Request("https://app.test/api/workspaces/x/offers"), ctx));
const post = (body: unknown) =>
  import("./route").then(({ POST }) =>
    POST(new Request("https://app.test/api/workspaces/x/offers", { method: "POST", body: JSON.stringify(body) }), ctx),
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OFFER_PROMOTIONS_ENABLED", "true");
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
  mocks.artifacts.assistantWorkspace.mockResolvedValue({ id: WORKSPACE_ID, market: "hk" });
  mocks.artifacts.assistantLocations.mockResolvedValue([{ id: L1 }, { id: L2 }]);
  mocks.offers.create.mockImplementation(async (_w: string, _a: string, input: { location_id: string | null }) =>
    offer({ locationId: input.location_id }),
  );
  mocks.offers.list.mockResolvedValue([]);
  mocks.assets.get.mockResolvedValue(null);
});

afterEach(() => vi.unstubAllEnvs());

describe("offers collection route", () => {
  it("answers 404 on GET and POST when the flag is off", async () => {
    vi.stubEnv("OFFER_PROMOTIONS_ENABLED", "TRUE");
    expect((await get()).status).toBe(404);
    expect((await post(validBody)).status).toBe(404);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
    expect(mocks.offers.create).not.toHaveBeenCalled();
  });

  it("returns the status authorizeWorkspaceRequest gives a non-member", async () => {
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    expect((await get()).status).toBe(403);
    expect((await post(validBody)).status).toBe(403);
    mocks.authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 401, code: "unauthenticated" });
    expect((await post(validBody)).status).toBe(401);
  });

  it("rejects an invalid workspace id and a non-object body with 400", async () => {
    const { POST } = await import("./route");
    const badId = await POST(new Request("https://app.test/x", { method: "POST", body: "{}" }), {
      params: Promise.resolve({ workspaceId: "nope" }),
    });
    expect(badId.status).toBe(400);
    const badJson = await POST(new Request("https://app.test/x", { method: "POST", body: "[1]" }), ctx);
    expect(badJson.status).toBe(400);
  });

  describe("POST", () => {
    it("creates a draft offer and records offer.created", async () => {
      const res = await post(validBody);
      expect(res.status).toBe(201);
      expect((await res.json()).offer.locationId).toBe(L1);
      expect(mocks.offers.create).toHaveBeenCalledWith(WORKSPACE_ID, expect.any(String), expect.objectContaining({ title: "Lunch set", location_id: L1 }));
      expect(mocks.recordNeonEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          event: "offer.created",
          payload: { offer_id: "55555555-5555-4555-8555-555555555555", location_id: L1 },
        }),
      );
    });

    it("lets an owner create a workspace-wide offer", async () => {
      expect((await post({ ...validBody, location_id: null })).status).toBe(201);
    });

    it("refuses a viewer", async () => {
      mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("viewer"));
      expect((await post(validBody)).status).toBe(403);
      expect(mocks.offers.create).not.toHaveBeenCalled();
    });

    it("refuses a scoped manager a workspace-wide offer", async () => {
      mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [L1]));
      expect((await post({ ...validBody, location_id: null })).status).toBe(403);
      expect(mocks.offers.create).not.toHaveBeenCalled();
    });

    it("refuses a scoped manager an out-of-scope location, and allows the in-scope one", async () => {
      mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [L1]));
      expect((await post({ ...validBody, location_id: L2 })).status).toBe(403);
      expect(mocks.offers.create).not.toHaveBeenCalled();
      expect((await post({ ...validBody, location_id: L1 })).status).toBe(201);
      expect(mocks.recordNeonEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "offer.created" }));
    });

    it("rejects a location outside the workspace with 400", async () => {
      mocks.artifacts.assistantLocations.mockResolvedValue([{ id: L2 }]);
      const res = await post(validBody);
      expect(res.status).toBe(400);
      expect(mocks.offers.create).not.toHaveBeenCalled();
    });

    it("rejects an invalid body and a currency that is not the workspace market's", async () => {
      expect((await post({ ...validBody, title: "" })).status).toBe(400);
      const wrongCurrency = await post({ ...validBody, currency: "TWD" });
      expect(wrongCurrency.status).toBe(400);
      mocks.artifacts.assistantWorkspace.mockResolvedValue({ id: WORKSPACE_ID, market: "tw" });
      expect((await post(validBody)).status).toBe(400);
      expect(mocks.offers.create).not.toHaveBeenCalled();
    });

    describe("asset_id", () => {
      const approved = (location_id: string | null) => ({ id: ASSET_ID, location_id, rights_status: "approved" });
      it("accepts a workspace-wide approved asset", async () => {
        mocks.assets.get.mockResolvedValue(approved(null));
        expect((await post({ ...validBody, asset_id: ASSET_ID })).status).toBe(201);
        expect(mocks.assets.get).toHaveBeenCalledWith(WORKSPACE_ID, ASSET_ID);
      });
      it("rejects an asset from another location", async () => {
        mocks.assets.get.mockResolvedValue(approved(L2));
        const res = await post({ ...validBody, asset_id: ASSET_ID });
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("asset_id is invalid");
        expect(mocks.offers.create).not.toHaveBeenCalled();
      });
      it("rejects an asset that is not rights-approved, and one that does not exist", async () => {
        mocks.assets.get.mockResolvedValue({ ...approved(null), rights_status: "needs_review" });
        expect((await post({ ...validBody, asset_id: ASSET_ID })).status).toBe(400);
        mocks.assets.get.mockResolvedValue(null);
        expect((await post({ ...validBody, asset_id: ASSET_ID })).status).toBe(400);
      });
      it("rejects a location asset for a workspace-wide offer", async () => {
        mocks.assets.get.mockResolvedValue(approved(L1));
        expect((await post({ ...validBody, location_id: null, asset_id: ASSET_ID })).status).toBe(400);
      });
    });

    it("answers 429 from the rate limiter before any write", async () => {
      mocks.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
      const res = await post(validBody);
      expect(res.status).toBe(429);
      expect(mocks.offers.create).not.toHaveBeenCalled();
      expect(mocks.recordNeonEvent).not.toHaveBeenCalled();
      expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ scope: "action_mutation", failClosed: true }));
    });

    it("answers 503 when the repository fails", async () => {
      mocks.offers.create.mockRejectedValue(new Error("db down"));
      expect((await post(validBody)).status).toBe(503);
      expect(mocks.recordNeonEvent).not.toHaveBeenCalled();
    });
  });

  describe("GET", () => {
    const all = [offer({ id: "a", locationId: null }), offer({ id: "b", locationId: L1 }), offer({ id: "c", locationId: L2 })];
    it("returns workspace-wide and L1 offers, not L2, to a manager scoped to L1", async () => {
      mocks.offers.list.mockResolvedValue(all);
      mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [L1]));
      const res = await get();
      expect(res.status).toBe(200);
      expect((await res.json()).offers.map((o: Offer) => o.id)).toEqual(["a", "b"]);
    });
    it("returns every offer to an owner and to a viewer, asking for viewer access only", async () => {
      mocks.offers.list.mockResolvedValue(all);
      mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("viewer"));
      expect(((await (await get()).json()).offers as Offer[]).length).toBe(3);
      expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID }, { minRole: "viewer" });
    });
  });
});
