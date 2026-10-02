import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeLike, LOCATION_ID, WORKSPACE_ID } from "@/app/api/actions/_shared/test-db";
import type { Offer } from "@/lib/workspace/offers";

const L2 = "33333333-3333-4333-8333-333333333333";
const OFFER_ID = "55555555-5555-4555-8555-555555555555";

const mocks = vi.hoisted(() => ({
  authorizeWorkspaceRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  recordNeonEvent: vi.fn(),
  llmComplete: vi.fn(),
  offers: { scope: vi.fn(), get: vi.fn() },
  actions: { createObjective: vi.fn() },
}));

vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  authorizeWorkspaceRequest: (...args: unknown[]) => mocks.authorizeWorkspaceRequest(...args),
}));
vi.mock("@/lib/repositories/offers", () => ({ offerRepository: () => mocks.offers }));
vi.mock("@/lib/repositories/action-mutations", () => ({ actionMutationRepository: () => mocks.actions }));
vi.mock("@/lib/security/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/security/rate-limit")>()),
  enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args),
}));
vi.mock("@/lib/workspace/audit", async (original) => ({
  ...(await original<typeof import("@/lib/workspace/audit")>()),
  recordNeonEvent: (...args: unknown[]) => mocks.recordNeonEvent(...args),
  ipHashFor: () => "hash",
}));
vi.mock("@/lib/llm", () => ({ llmComplete: mocks.llmComplete, llmConfigured: () => true }));

const ctx = { params: Promise.resolve({ offerId: OFFER_ID }) };

function offer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: OFFER_ID,
    workspaceId: WORKSPACE_ID,
    locationId: LOCATION_ID,
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
    status: "confirmed",
    revision: 3,
    confirmedAt: "2026-10-01T00:00:00.000Z",
    expired: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const post = (body?: unknown, params = ctx) =>
  import("./route").then(({ POST }) =>
    POST(
      new Request("https://app.test/api/offers/x/promotions", {
        method: "POST",
        ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
      }),
      params,
    ),
  );

let createdIds: Map<string, { id: string; created: boolean }>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OFFER_PROMOTIONS_ENABLED", "true");
  mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("owner"));
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
  mocks.offers.scope.mockResolvedValue({ offerId: OFFER_ID, workspaceId: WORKSPACE_ID, locationId: LOCATION_ID });
  mocks.offers.get.mockResolvedValue(offer());
  createdIds = new Map();
  mocks.actions.createObjective.mockImplementation(async (row: Record<string, unknown>) => {
    const key = row.dedupe_key as string;
    const existing = createdIds.get(key);
    if (existing) return { id: existing.id, created: false };
    const made = { id: `act-${createdIds.size + 1}`, created: true };
    createdIds.set(key, made);
    return made;
  });
});

afterEach(() => vi.unstubAllEnvs());

const rowFor = (templateKey: string) =>
  mocks.actions.createObjective.mock.calls.map((c) => c[0] as Record<string, unknown>).find((r) => r.template_key === templateKey)!;

describe("POST /api/offers/[offerId]/promotions", () => {
  it("answers 404 before any lookup when the flag is off", async () => {
    vi.stubEnv("OFFER_PROMOTIONS_ENABLED", "1");
    expect((await post({})).status).toBe(404);
    expect(mocks.offers.scope).not.toHaveBeenCalled();
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("answers 400 on an invalid offer id and 404 on an unknown offer, before authorizing", async () => {
    expect((await post({}, { params: Promise.resolve({ offerId: "nope" }) })).status).toBe(400);
    mocks.offers.scope.mockResolvedValue(null);
    expect((await post({})).status).toBe(404);
    expect(mocks.authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });

  it("creates one action per channel by default, instagram first, with the contract row", async () => {
    const res = await post({});
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      actions: [
        { channel: "instagram", actionId: "act-1", created: true },
        { channel: "google", actionId: "act-2", created: true },
      ],
    });
    expect(mocks.authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID }, { minRole: "manager" });
    const ig = rowFor("offer-instagram-post");
    expect(ig).toMatchObject({
      workspace_id: WORKSPACE_ID,
      location_id: LOCATION_ID,
      source: "owner_objective",
      offer_id: OFFER_ID,
      source_finding_keys: [],
      priority: "medium",
      priority_score: 50,
      priority_factors: [],
      provided_inputs: {},
      action_state: "recommended",
      measurement_state: "not_eligible",
      capability: "Beta",
      dedupe_key: `offer:${OFFER_ID}:offer-instagram-post`,
    });
    expect(ig.evidence).toMatchObject({
      factType: "Recommended",
      source: "Owner offer",
      value: "",
      detail: { en: "Lunch set", "zh-HK": "Lunch set", "zh-TW": "Lunch set" },
    });
    expect(rowFor("offer-google-post").dedupe_key).toBe(`offer:${OFFER_ID}:offer-google-post`);
  });

  it("works with no body at all", async () => {
    expect((await post()).status).toBe(201);
    expect(mocks.actions.createObjective).toHaveBeenCalledTimes(2);
  });

  it("never persists offer_id as a required input: the offer_id column answers it (R3)", async () => {
    await post({});
    for (const key of ["offer-instagram-post", "offer-google-post"]) {
      const required = rowFor(key).required_inputs as string[];
      expect(required).not.toContain("offer_id");
      expect(required).toContain("brand_voice");
    }
  });

  it("uses the offer's location, including null for a workspace-wide offer", async () => {
    mocks.offers.scope.mockResolvedValue({ offerId: OFFER_ID, workspaceId: WORKSPACE_ID, locationId: null });
    mocks.offers.get.mockResolvedValue(offer({ locationId: null }));
    await post({ channels: ["google"] });
    expect(rowFor("offer-google-post").location_id).toBeNull();
    expect(rowFor("offer-google-post").dedupe_key).toBe(`offer:${OFFER_ID}:offer-google-post`);
  });

  it("creates only the requested channel", async () => {
    const res = await post({ channels: ["google"] });
    expect((await res.json()).actions).toEqual([{ channel: "google", actionId: "act-1", created: true }]);
    expect(mocks.actions.createObjective).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: a repeat returns the same ids, created:false, and records no audit event", async () => {
    await post({});
    mocks.recordNeonEvent.mockClear();
    const res = await post({});
    expect((await res.json()).actions).toEqual([
      { channel: "instagram", actionId: "act-1", created: false },
      { channel: "google", actionId: "act-2", created: false },
    ]);
    expect(mocks.recordNeonEvent).not.toHaveBeenCalled();
  });

  it("audits action.updated once per created action, with the offer id", async () => {
    await post({});
    expect(mocks.recordNeonEvent).toHaveBeenCalledTimes(2);
    expect(mocks.recordNeonEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        locationId: LOCATION_ID,
        actorType: "user",
        actorId: "user-1",
        event: "action.updated",
        entityType: "action",
        entityId: "act-1",
        payload: { change: "created", source: "owner_objective", template_key: "offer-instagram-post", offer_id: OFFER_ID },
      }),
    );
  });

  it.each([
    ["empty channels", { channels: [] }],
    ["an unknown channel", { channels: ["sms"] }],
    ["a mix with an unknown channel", { channels: ["instagram", "sms"] }],
    ["a non-array", { channels: "instagram" }],
    ["a non-string entry", { channels: [1] }],
  ])("answers 400 for %s and creates nothing", async (_label, body) => {
    expect((await post(body)).status).toBe(400);
    expect(mocks.actions.createObjective).not.toHaveBeenCalled();
  });

  it("answers 400 for a malformed body", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post("[]")).status).toBe(400);
  });

  it("answers 409 offer_inactive for a draft or archived offer", async () => {
    for (const status of ["draft", "archived"] as const) {
      mocks.offers.get.mockResolvedValue(offer({ status }));
      const res = await post({});
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "offer_inactive" });
    }
    expect(mocks.actions.createObjective).not.toHaveBeenCalled();
  });

  it("answers 409 offer_expired for a confirmed offer past its last day", async () => {
    mocks.offers.get.mockResolvedValue(offer({ expired: true }));
    const res = await post({});
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "offer_expired" });
    expect(mocks.actions.createObjective).not.toHaveBeenCalled();
  });

  it("answers 404 when the offer vanishes between scope and read", async () => {
    mocks.offers.get.mockResolvedValue(null);
    expect((await post({})).status).toBe(404);
  });

  it("refuses a viewer with 403", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("viewer"));
    expect((await post({})).status).toBe(403);
    expect(mocks.actions.createObjective).not.toHaveBeenCalled();
  });

  it("lets a scoped manager use a workspace-wide offer", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [LOCATION_ID]));
    mocks.offers.scope.mockResolvedValue({ offerId: OFFER_ID, workspaceId: WORKSPACE_ID, locationId: null });
    mocks.offers.get.mockResolvedValue(offer({ locationId: null }));
    expect((await post({})).status).toBe(201);
  });

  it("refuses a scoped manager on an offer at a location outside their scope", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [LOCATION_ID]));
    mocks.offers.scope.mockResolvedValue({ offerId: OFFER_ID, workspaceId: WORKSPACE_ID, locationId: L2 });
    mocks.offers.get.mockResolvedValue(offer({ locationId: L2 }));
    expect((await post({})).status).toBe(403);
    expect(mocks.actions.createObjective).not.toHaveBeenCalled();
  });

  it("refuses a scoped manager when the offer read moved it out of scope after the scope check (F2)", async () => {
    mocks.authorizeWorkspaceRequest.mockImplementation(authorizeLike("manager", [LOCATION_ID]));
    mocks.offers.scope.mockResolvedValue({ offerId: OFFER_ID, workspaceId: WORKSPACE_ID, locationId: LOCATION_ID });
    mocks.offers.get.mockResolvedValue(offer({ locationId: L2 }));
    const res = await post({});
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(mocks.actions.createObjective).not.toHaveBeenCalled();
    expect(mocks.recordNeonEvent).not.toHaveBeenCalled();
  });

  it("answers 429 when rate limited, before creating anything", async () => {
    mocks.enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 9 });
    expect((await post({})).status).toBe(429);
    expect(mocks.actions.createObjective).not.toHaveBeenCalled();
  });

  it("answers 503 when the repository fails", async () => {
    mocks.actions.createObjective.mockRejectedValue(new Error("action_create_failed"));
    expect((await post({})).status).toBe(503);
  });

  it("never calls the model: the route does not import or invoke llmComplete", async () => {
    await post({});
    expect(mocks.llmComplete).not.toHaveBeenCalled();
    const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/llm|runAgentForAction/i);
  });
});
