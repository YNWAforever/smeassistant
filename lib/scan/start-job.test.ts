import { describe, expect, it, vi } from "vitest";
import { buildScanJobInsert, insertScanJob, parseScanStartBody, type ScanStartInput } from "./start-job";

vi.mock("@/lib/supabase/admin", () => ({
  supabaseServer: () => {
    throw new Error("start-job tests must inject a client");
  },
}));

const validBody = {
  locale: "en",
  market: "HK",
  business_name: " Happy Cafe ",
  place_id: "place-123",
  place_match_confidence: "high",
  continue_without_place: false,
  website_url: "",
  ig_handle: "@happy.cafe",
  ig_match_provenance: "picker_confirmed",
  industry: "restaurant",
  district: "Central",
  objective: "more_leads",
};

function parsed(overrides: Record<string, unknown> = {}): ScanStartInput {
  const result = parseScanStartBody({ ...validBody, ...overrides });
  if (!result.ok) throw new Error(result.error);
  return result.input;
}

describe("parseScanStartBody", () => {
  it("normalizes upstream's fields", () => {
    expect(parsed()).toEqual({
      businessName: "Happy Cafe",
      instagramHandle: "happy.cafe",
      instagramMatchProvenance: "picker_confirmed",
      websiteUrl: "",
      industry: "restaurant",
      district: "Central",
      locale: "en",
      market: "HK",
      objective: "more_leads",
      placeId: "place-123",
      dataId: null,
      dataCid: null,
      placeMatchConfidence: "high",
      provider: "serpapi",
      manualEntry: false,
      alternateNames: [],
      address: "",
      mapsUrl: "",
      facebookUrl: "",
      parentJobId: null,
      userRole: null,
    });
  });

  it.each([
    [{ business_name: "" }, "business_name is required"],
    [{ market: "US" }, "market must be HK or TW"],
    [{ district: "" }, "industry and district are required"],
    [{ locale: "fr" }, "locale is invalid"],
    [{ objective: "world_domination" }, "objective is invalid"],
    [{ place_id: null, place_match_confidence: null }, "confirm a SerpApi business or use manual entry"],
    [{ manual_entry: true, continue_without_place: false }, "confirm a SerpApi business or use manual entry"],
    [{ maps_url: "javascript:alert(1)" }, "confirm a SerpApi business or use manual entry"],
    [{ parent_job_id: "not-a-uuid" }, "parent_job_id is invalid"],
  ])("rejects %j with upstream's error", (override, error) => {
    expect(parseScanStartBody({ ...validBody, ...override })).toEqual({ ok: false, error });
  });

  it("treats a non-object body as empty input", () => {
    expect(parseScanStartBody(null)).toEqual({ ok: false, error: "business_name is required" });
    expect(parseScanStartBody(["x"])).toEqual({ ok: false, error: "business_name is required" });
  });

  it("accepts manual entry without provider identifiers", () => {
    const input = parsed({ place_id: null, place_match_confidence: null, manual_entry: true, continue_without_place: true });
    expect(input).toMatchObject({ provider: null, manualEntry: true, placeId: null, placeMatchConfidence: null });
  });
});

describe("buildScanJobInsert", () => {
  it("builds upstream's audit_jobs row with a fresh share slug and no attribution keys", () => {
    const row = buildScanJobInsert(parsed());
    expect(row).toMatchObject({
      business_name: "Happy Cafe",
      ig_handle: "happy.cafe",
      website_url: null,
      status: "queued",
      region: "hk",
      business_objective: "more_leads",
      place_id: "place-123",
      place_match_confidence: "high",
      parent_job_id: null,
      input_snapshot: expect.objectContaining({ version: 2, instagramMatchProvenance: "picker_confirmed", continueWithoutPlace: false }),
    });
    expect(row.share_slug).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(row).not.toHaveProperty("workspace_id");
    expect(row).not.toHaveProperty("location_id");
    expect(buildScanJobInsert(parsed()).share_slug).not.toBe(row.share_slug);
  });

  it("writes place_match_confidence to the column only alongside a place_id", () => {
    const row = buildScanJobInsert(parsed({ place_id: null, data_id: "0x1:0x2", place_match_confidence: "medium" }));
    expect(row.place_id).toBeNull();
    expect(row.place_match_confidence).toBeNull();
    expect((row.input_snapshot as Record<string, unknown>).placeMatchConfidence).toBe("medium");
  });

  it("adds server-side attribution only when it is supplied", () => {
    expect(buildScanJobInsert(parsed(), { workspaceId: "ws-1" })).toMatchObject({ workspace_id: "ws-1" });
    expect(buildScanJobInsert(parsed(), { workspaceId: "ws-1" })).not.toHaveProperty("location_id");
    expect(buildScanJobInsert(parsed(), { workspaceId: "ws-1", locationId: "loc-1" })).toMatchObject({
      workspace_id: "ws-1",
      location_id: "loc-1",
    });
    expect(buildScanJobInsert(parsed(), { workspaceId: null, locationId: null })).not.toHaveProperty("workspace_id");
  });
});

describe("insertScanJob", () => {
  function fakeClient(result: { data: unknown; error: unknown }) {
    const insert = vi.fn(() => ({ select: () => ({ single: async () => result }) }));
    const from = vi.fn(() => ({ insert }));
    return { client: { from } as never, from, insert };
  }

  it("inserts into audit_jobs and returns the new id", async () => {
    const { client, from, insert } = fakeClient({ data: { id: "job-1" }, error: null });
    await expect(insertScanJob(parsed(), { workspaceId: "ws-1" }, client)).resolves.toEqual({ ok: true, jobId: "job-1" });
    expect(from).toHaveBeenCalledWith("audit_jobs");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: "ws-1", status: "queued" }));
  });

  it("surfaces the database error instead of throwing", async () => {
    const { client } = fakeClient({ data: null, error: { message: "boom" } });
    await expect(insertScanJob(parsed(), {}, client)).resolves.toEqual({ ok: false, error: { message: "boom" } });
  });
});
