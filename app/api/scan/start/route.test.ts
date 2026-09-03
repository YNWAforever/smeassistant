import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 1 })),
  insert: vi.fn(),
  recordEvent: vi.fn(async () => ({ recorded: true })),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  rateLimitedResponse: vi.fn(() => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseServer: () => ({
    from: () => ({ insert: mocks.insert }),
  }),
}));

vi.mock("@/lib/analytics/record-event", () => ({
  recordEvent: mocks.recordEvent,
  resolveAnalyticsSession: () => ({ id: "anonymous-session", created: false }),
  setAnalyticsSessionCookie: vi.fn(),
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("https://scanner.test/api/scan/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  locale: "en",
  market: "HK",
  business_name: " Happy Cafe ",
  place_id: "place-123",
  place_match_confidence: "high",
  continue_without_place: false,
  website_url: "",
  ig_handle: "",
  industry: "restaurant",
  district: "Central",
  objective: "more_leads",
};

describe("POST /api/scan/start progressive input", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
    mocks.insert.mockImplementation((payload: Record<string, unknown>) => ({
      select: () => ({
        single: async () => ({ data: { id: "job-1", payload }, error: null }),
      }),
    }));
  });

  it("allows optional Instagram and website and persists the exact normalized snapshot", async () => {
    const response = await POST(request(validBody));
    expect(response.status).toBe(200);
    expect(mocks.recordEvent).toHaveBeenCalledWith(
      { name: "scan_started", properties: { market: "HK", locale: "en" } },
      { jobId: "job-1", anonymousSessionId: "anonymous-session" },
    );
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      business_name: "Happy Cafe",
      ig_handle: null,
      website_url: null,
      region: "hk",
      place_id: "place-123",
      place_match_confidence: "high",
      parent_job_id: null,
      business_objective: "more_leads",
      input_snapshot: {
        version: 2,
        provider: "serpapi",
        manualEntry: false,
        dataId: null,
        dataCid: null,
        alternateNames: [],
        address: "",
        mapsUrl: "",
        facebookUrl: "",
        locale: "en",
        market: "HK",
        businessName: "Happy Cafe",
        placeId: "place-123",
        placeMatchConfidence: "high",
        continueWithoutPlace: false,
        websiteUrl: "",
        instagramHandle: "",
        instagramMatchProvenance: null,
        industry: "restaurant",
        district: "Central",
        objective: "more_leads",
      },
    }));
  });

  it("accepts data-id-only SerpApi evidence without overloading the place_id column", async () => {
    const response = await POST(request({
      ...validBody,
      place_id: null,
      data_id: "0x1:0x2",
      data_cid: "123",
      provider: "serpapi",
      manual_entry: false,
      place_match_confidence: "medium",
      alternate_names: ["Happy Cafe HK"],
      address: "Central, Hong Kong",
      maps_url: "https://www.google.com/maps/place/Happy+Cafe",
      facebook_url: "https://facebook.com/happycafe",
    }));

    expect(response.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      place_id: null,
      place_match_confidence: null,
      input_snapshot: expect.objectContaining({
        version: 2,
        provider: "serpapi",
        manualEntry: false,
        placeId: null,
        dataId: "0x1:0x2",
        dataCid: "123",
        alternateNames: ["Happy Cafe HK"],
        address: "Central, Hong Kong",
        mapsUrl: "https://www.google.com/maps/place/Happy+Cafe",
        facebookUrl: "https://facebook.com/happycafe",
      }),
    }));
  });

  it("accepts explicit manual entry without provider identifiers", async () => {
    const response = await POST(request({
      ...validBody,
      place_id: null,
      provider: null,
      manual_entry: true,
      place_match_confidence: null,
      continue_without_place: true,
    }));

    expect(response.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      place_id: null,
      place_match_confidence: null,
      input_snapshot: expect.objectContaining({
        version: 2,
        provider: null,
        manualEntry: true,
      }),
    }));
  });

  it.each([
    { provider: "other" },
    { maps_url: "javascript:alert(1)" },
    { facebook_url: "file:///private.txt" },
    { address: "x".repeat(501) },
    { alternate_names: Array.from({ length: 11 }, (_, index) => String(index)) },
    { data_id: "x".repeat(257) },
  ])("rejects invalid provider evidence before database work: %j", async (override) => {
    const response = await POST(request({
      ...validBody,
      provider: "serpapi",
      manual_entry: false,
      ...override,
    }));
    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("requires explicit market and either a confirmed place or continue-without-match", async () => {
    const noMarket = await POST(request({ ...validBody, market: undefined }));
    const noChoice = await POST(request({
      ...validBody,
      place_id: null,
      place_match_confidence: null,
      continue_without_place: false,
    }));
    expect(noMarket.status).toBe(400);
    expect(noChoice.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("creates a child job for market correction without updating the parent", async () => {
    const parentJobId = "00000000-0000-4000-8000-000000000001";
    const response = await POST(request({
      ...validBody,
      market: "TW",
      parent_job_id: parentJobId,
    }));
    expect(response.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      region: "tw",
      parent_job_id: parentJobId,
    }));
  });

  it("rejects malformed parent IDs before database work", async () => {
    const response = await POST(request({ ...validBody, parent_job_id: "not-a-uuid" }));
    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("ignores client-supplied workspace_id and location_id (attribution is server-side only)", async () => {
    const response = await POST(request({
      ...validBody,
      workspace_id: "00000000-0000-4000-8000-00000000aaaa",
      location_id: "00000000-0000-4000-8000-00000000bbbb",
    }));

    expect(response.status).toBe(200);
    const row = mocks.insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(row).not.toHaveProperty("workspace_id");
    expect(row).not.toHaveProperty("location_id");
    expect(JSON.stringify(row)).not.toContain("00000000-0000-4000-8000-00000000aaaa");
  });

  it("answers 400 rather than throwing when the JSON body is not an object", async () => {
    const response = await POST(new Request("https://scanner.test/api/scan/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "null",
    }));
    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
describe("POST /api/scan/start analytics isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
    mocks.insert.mockImplementation((payload: Record<string, unknown>) => ({
      select: () => ({ single: async () => ({ data: { id: "job-1", payload }, error: null }) }),
    }));
  });

  it("returns the committed job when analytics never settles", async () => {
    mocks.recordEvent.mockImplementationOnce(() => new Promise(() => {}));

    const result = await Promise.race([
      POST(request(validBody)),
      new Promise<"test_timeout">((resolve) => setTimeout(() => resolve("test_timeout"), 100)),
    ]);

    expect(result).not.toBe("test_timeout");
    expect((result as Response).status).toBe(200);
  });

  describe("ig_match_provenance", () => {
    async function insertedSnapshot(overrides: Record<string, unknown>): Promise<Record<string, unknown>> {
      await POST(request({ ...validBody, ...overrides }));
      const row = mocks.insert.mock.calls[0]![0] as Record<string, unknown>;
      return row.input_snapshot as Record<string, unknown>;
    }

    it("records a valid provenance in the input snapshot", async () => {
      const snapshot = await insertedSnapshot({ ig_handle: "kamman.hk", ig_match_provenance: "gbp_cross_referenced" });
      expect(snapshot.instagramMatchProvenance).toBe("gbp_cross_referenced");
    });

    it("accepts every value the picker can emit", async () => {
      for (const provenance of ["manual_typed", "picker_confirmed", "gbp_cross_referenced"]) {
        vi.clearAllMocks();
        mocks.enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
        mocks.insert.mockImplementation((payload: Record<string, unknown>) => ({
          select: () => ({ single: async () => ({ data: { id: "job-1", payload }, error: null }) }),
        }));
        const snapshot = await insertedSnapshot({ ig_handle: "kamman.hk", ig_match_provenance: provenance });
        expect(snapshot.instagramMatchProvenance).toBe(provenance);
      }
    });

    it("drops an unrecognized provenance rather than storing it", async () => {
      const snapshot = await insertedSnapshot({ ig_handle: "kamman.hk", ig_match_provenance: "oauth_verified" });
      expect(snapshot.instagramMatchProvenance).toBeNull();
    });

    it("stores null when no handle was supplied", async () => {
      const snapshot = await insertedSnapshot({ ig_handle: "", ig_match_provenance: "picker_confirmed" });
      expect(snapshot.instagramMatchProvenance).toBeNull();
    });
  });

});