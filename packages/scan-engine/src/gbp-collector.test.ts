import { afterEach, describe, expect, it, vi } from "vitest";
import { scrapeGBP } from "./gbp-collector";

afterEach(() => {
  vi.unstubAllEnvs();
});

const evidence = {
  placeId: "place-1",
  dataId: "data-1",
  dataCid: "cid-1",
  mapsUrl: "https://maps.example/demo",
  address: "Central",
  alternateNames: [],
};

/**
 * Every test must inject this. GBPCollectorDependencies.fetchEvidence defaults to
 * the REAL fetchSerpApiGoogleEvidence, so a test that omits it makes an actual
 * HTTPS request to serpapi.com with a 10s timeout — passing only when the
 * connection fails fast, and timing out against vitest's 5s limit when it does
 * not. Two tests here failed exactly that way under load.
 */
const noEvidence = () =>
  vi.fn(async () => ({ photos: [], posts: [], failures: [] }));

describe("scrapeGBP", () => {
  it("uses confirmed Places New facts without invoking the fallback", async () => {
    const fetchSerp = vi.fn(async () => ({
      ok: false as const,
      code: "SERPAPI_GBP_FAILED" as const,
      retryable: true,
    }));

    const result = await scrapeGBP("Demo Coffee", "Central", "hk", evidence, {
      googleKey: "google-key",
      fetchEvidence: noEvidence(),
      serpApiKey: "serp-key",
      fetchPlaces: async () => ({
        ok: true,
        value: {
          placeId: "place-1",
          name: "Demo Coffee",
          address: "Central",
          mapsUrl: "https://maps.example/demo",
          rating: 4.7,
          reviewsCount: 42,
          categories: ["Cafe"],
          hoursComplete: true,
          photoNames: ["places/place-1/photos/photo-1"],
          reviews: [],
        },
      }),
      fetchSerp,
    });

    expect(result.provider).toMatchObject({
      status: "measured",
      confidence: "high",
      data: { available: true, place_id: "place-1", rating: 4.7, reviews_count: 42 },
    });
    expect(result.raw).toMatchObject({ source: "google_places_new", place_id: "place-1" });
    expect(fetchSerp).not.toHaveBeenCalled();
  });

  it("uses SerpApi facts when Places New is denied", async () => {
    const result = await scrapeGBP("Demo Coffee", "Central", "hk", evidence, {
      googleKey: "google-key",
      fetchEvidence: noEvidence(),
      serpApiKey: "serp-key",
      fetchPlaces: async () => ({
        ok: false,
        code: "GOOGLE_PLACES_REQUEST_DENIED",
        retryable: false,
        httpStatus: 403,
      }),
      fetchSerp: async () => ({
        ok: true,
        value: {
          name: "Demo Coffee",
          address: "Central",
          rating: 4.6,
          reviewsCount: 88,
          categories: ["Cafe"],
          reviews: [],
        },
      }),
    });

    expect(result.provider).toMatchObject({
      status: "measured",
      confidence: "medium",
      data: { available: true, rating: 4.6, reviews_count: 88 },
    });
    expect(result.raw).toMatchObject({ source: "serpapi", data_id: "data-1", place_id: "place-1" });
  });

  it("preserves a specific terminal limitation code", async () => {
    const result = await scrapeGBP("Demo Coffee", "Central", "hk", {
      ...evidence,
      dataId: null,
      dataCid: null,
      mapsUrl: null,
      address: null,
    }, {
      googleKey: "google-key",
      fetchEvidence: noEvidence(),
      serpApiKey: null,
      fetchPlaces: async () => ({
        ok: false,
        code: "GOOGLE_PLACES_REQUEST_DENIED",
        retryable: false,
        httpStatus: 403,
      }),
      fetchSerp: async () => ({
        ok: false,
        code: "SERPAPI_GBP_NOT_CONFIGURED",
        retryable: false,
      }),
    });

    expect(result.provider).toEqual({
      status: "failed",
      limitationCode: "GOOGLE_PLACES_REQUEST_DENIED",
      retryable: false,
    });
    expect(result.raw).toBeNull();
  });

  it("reports unavailable when neither GBP provider is configured", async () => {
    const fetchPlaces = vi.fn();
    const fetchSerp = vi.fn();

    const result = await scrapeGBP("Demo Coffee", "Central", "hk", evidence, {
      googleKey: null,
      fetchEvidence: noEvidence(),
      serpApiKey: null,
      fetchPlaces,
      fetchSerp,
    });

    expect(result).toEqual({
      provider: { status: "unavailable", limitationCode: "GBP_PROVIDER_NOT_CONFIGURED" },
      raw: null,
    });
    expect(fetchPlaces).not.toHaveBeenCalled();
    expect(fetchSerp).not.toHaveBeenCalled();
  });

  it("attaches Google media only after choosing scoreable GBP facts", async () => {
    const fetchEvidence = vi.fn(async () => ({
      photos: [{ id: "photo-hash", image_url: "https://images.example/photo.jpg", source_url: "https://maps.example/demo", attribution: "Google Maps" as const }],
      posts: [{ id: "post-1", text: "New menu", published_at: "2026-07-20", image_url: "https://images.example/post.jpg", link: "https://maps.example/post/1", action_link: "https://example.com/menu" }],
      failures: [],
    }));
    const result = await scrapeGBP("Demo Coffee", "Central", "hk", evidence, {
      googleKey: "google-key", serpApiKey: "serp-key",
      fetchPlaces: async () => ({ ok: true, value: { placeId: "place-1", name: "Demo Coffee", address: "Central", mapsUrl: "https://maps.example/demo", rating: 4.7, reviewsCount: 42, categories: ["Cafe"], hoursComplete: true, photoNames: [], reviews: [] } }),
      fetchEvidence,
    });
    expect(result.provider).toMatchObject({ status: "measured", data: { rating: 4.7, reviews_count: 42 } });
    expect(result.raw).toMatchObject({ source: "google_places_new", rating: 4.7, photos: [{ id: "photo-hash" }], posts: [{ id: "post-1", text: "New menu" }], evidence_failures: [] });
    expect(fetchEvidence).toHaveBeenCalledWith({ dataId: "data-1", mapsUrl: "https://maps.example/demo", apiKey: "serp-key", language: "zh-TW" });
  });

  it("preserves measured provider facts when Google media enrichment throws", async () => {
    const result = await scrapeGBP("Demo Coffee", "Central", "hk", evidence, {
      googleKey: "google-key", serpApiKey: "serp-key",
      fetchPlaces: async () => ({ ok: true, value: { placeId: "place-1", name: "Demo Coffee", address: "Central", mapsUrl: "https://maps.example/demo", rating: 4.7, reviewsCount: 42, categories: ["Cafe"], hoursComplete: true, photoNames: [], reviews: [] } }),
      fetchEvidence: async () => { throw new Error("https://serpapi.com/search.json?api_key=secret-api-key"); },
    });
    expect(result.provider).toMatchObject({ status: "measured", confidence: "high", data: { rating: 4.7, reviews_count: 42 } });
    expect(result.raw).toMatchObject({ source: "google_places_new", rating: 4.7, reviews_count: 42, photos: [], posts: [], evidence_failures: ["SERPAPI_GOOGLE_PHOTOS_FAILED", "SERPAPI_GOOGLE_POSTS_FAILED"] });
    expect(JSON.stringify(result)).not.toContain("secret-api-key");
  });

  it("does not enrich when no scoreable GBP facts were chosen", async () => {
    const fetchEvidence = vi.fn();
    const result = await scrapeGBP("Demo Coffee", "Central", "hk", evidence, {
      googleKey: "google-key", serpApiKey: "serp-key",
      fetchPlaces: async () => ({ ok: false, code: "GOOGLE_PLACES_REQUEST_DENIED", retryable: false, httpStatus: 403 }),
      fetchSerp: async () => ({ ok: false, code: "SERPAPI_GBP_FAILED", retryable: true }),
      fetchEvidence,
    });
    expect(result.provider.status).toBe("failed");
    expect(result.raw).toBeNull();
    expect(fetchEvidence).not.toHaveBeenCalled();
  });

  it("resolves its SerpApi key from the preferred SERPAPI_API_KEY name", async () => {
    // SERPAPI_API_KEY and SERPAPI_KEY are two spellings of one key, and merchant
    // search has honoured both since the shared resolver landed. This collector
    // read the legacy name alone, so an operator who set only the preferred name
    // lost the SerpApi fallback, saw GBP reported as not configured, and got no
    // media enrichment — with a perfectly valid key present the whole time.
    vi.stubEnv("SERPAPI_KEY", "");
    vi.stubEnv("SERPAPI_API_KEY", "preferred-serp-key");
    const fetchSerp = vi.fn(async () => ({
      ok: true as const,
      value: {
        name: "Demo Coffee",
        address: "Central",
        rating: 4.6,
        reviewsCount: 88,
        categories: ["Cafe"],
        reviews: [],
      },
    }));
    const fetchEvidence = vi.fn(async () => ({ photos: [], posts: [], failures: [] }));

    const result = await scrapeGBP("Demo Coffee", "Central", "hk", evidence, {
      googleKey: null,
      fetchSerp,
      fetchEvidence,
    });

    expect(fetchSerp).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "preferred-serp-key" }));
    expect(fetchEvidence).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "preferred-serp-key" }));
    expect(result.provider).toMatchObject({ status: "measured", confidence: "medium" });
  });

  it("reports GBP as not configured only when neither SerpApi name is set", async () => {
    vi.stubEnv("SERPAPI_KEY", "");
    vi.stubEnv("SERPAPI_API_KEY", "");
    const fetchSerp = vi.fn();

    const result = await scrapeGBP("Demo Coffee", "Central", "hk", evidence, {
      googleKey: null,
      fetchEvidence: noEvidence(),
      fetchSerp,
    });

    expect(fetchSerp).not.toHaveBeenCalled();
    expect(result.provider).toEqual({
      status: "unavailable",
      limitationCode: "GBP_PROVIDER_NOT_CONFIGURED",
    });
  });
});
