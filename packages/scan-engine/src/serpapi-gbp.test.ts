import { describe, expect, it, vi } from "vitest";
import { fetchSerpApiGbp } from "./serpapi-gbp";

describe("fetchSerpApiGbp", () => {
  it("normalizes scoreable place_info and original review evidence", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      place_info: { title: "Demo Coffee", address: "Central", rating: 4.6, reviews: 88, type: "Cafe" },
      reviews: [{
        review_id: "r1",
        link: "https://google.example/r1",
        rating: 5,
        iso_date: "2026-07-20T00:00:00Z",
        extracted_snippet: { original: "Excellent" },
        images: ["https://images.example/r1.jpg"],
        response: { iso_date: "2026-07-21T00:00:00Z", extracted_snippet: { original: "Thank you" } },
      }],
    }), { status: 200 }));

    const result = await fetchSerpApiGbp({
      dataId: "data-1",
      placeId: "place-1",
      apiKey: "secret",
      language: "zh-TW",
      fetcher,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        name: "Demo Coffee",
        rating: 4.6,
        reviewsCount: 88,
        reviews: [{ id: "r1", text: "Excellent", ownerResponse: "Thank you" }],
      },
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("engine=google_maps_reviews"),
      expect.anything(),
    );
  });

  it("returns a sanitized retryable outcome when the provider request throws", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("https://serpapi.com/search.json?api_key=secret");
    });

    await expect(fetchSerpApiGbp({
      dataId: "data-1",
      placeId: null,
      apiKey: "secret",
      language: "en",
      fetcher,
    })).resolves.toEqual({ ok: false, code: "SERPAPI_GBP_FAILED", retryable: true });
  });

  it("rejects malformed place facts without exposing provider data", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      place_info: { title: 1, rating: -1, reviews: "many" },
      reviews: { review_id: "should-not-be-used" },
    }), { status: 200 }));

    await expect(fetchSerpApiGbp({
      dataId: null,
      placeId: "place-1",
      apiKey: "secret",
      language: "en",
      fetcher,
    })).resolves.toEqual({ ok: false, code: "SERPAPI_GBP_INVALID_RESPONSE", retryable: false });
  });

  it("caps provider arrays and drops malformed review fields", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      place_info: { title: "Demo Coffee", rating: 4.6, reviews: 88, type: "Cafe" },
      reviews: Array.from({ length: 8 }, (_, index) => ({
        review_id: `r${index}`,
        rating: index === 0 ? "not-a-rating" : 5,
        extracted_snippet: { original: index === 0 ? 3 : "Fine" },
        images: Array.from({ length: 6 }, (_, imageIndex) => imageIndex === 0 ? "https://images.example/r.jpg" : imageIndex === 1 ? "javascript:unsafe" : imageIndex),
      })),
    }), { status: 200 }));

    const outcome = await fetchSerpApiGbp({
      dataId: "data-1",
      placeId: null,
      apiKey: "secret",
      language: "en",
      fetcher,
    });

    expect(outcome).toMatchObject({
      ok: true,
      value: {
        categories: ["Cafe"],
        reviews: Array.from({ length: 5 }, (_, index) => ({ id: `r${index}` })),
      },
    });
    if (outcome.ok) {
      expect(outcome.value.reviews[0]).toMatchObject({ rating: 0, text: "", images: ["https://images.example/r.jpg"] });
    }
  });

  it("keeps only credential-free public evidence URLs", async () => {
    const blockedUrls = [
      "http://127.0.0.1/review.jpg", "http://localhost/review.jpg", "http://10.0.0.1/review.jpg", "http://172.16.0.1/review.jpg", "http://192.168.0.1/review.jpg", "http://[::1]/review.jpg", "http://[fe80::1]/review.jpg", "http://[fc00::1]/review.jpg", "http://sub.localhost/review.jpg", "https://user:pass@example.com/review.jpg",
    ];
    for (const image of blockedUrls) {
      const fetcher = vi.fn(async () => new Response(JSON.stringify({
        place_info: { title: "Demo Coffee", rating: 4.6, reviews: 88 }, reviews: [{ review_id: "r1", images: [image] }],
      }), { status: 200 }));
      const outcome = await fetchSerpApiGbp({ dataId: "data-1", placeId: null, apiKey: "secret", language: "en", fetcher });
      expect(outcome).toMatchObject({ ok: true, value: { reviews: [{ images: [] }] } });
    }
    const publicFetcher = vi.fn(async () => new Response(JSON.stringify({ place_info: { title: "Demo Coffee", rating: 4.6, reviews: 88 }, reviews: [{ review_id: "r1", images: ["https://evidence.example/review.jpg"] }] }), { status: 200 }));
    await expect(fetchSerpApiGbp({ dataId: "data-1", placeId: null, apiKey: "secret", language: "en", fetcher: publicFetcher })).resolves.toMatchObject({ ok: true, value: { reviews: [{ images: ["https://evidence.example/review.jpg"] }] } });
  });

  it("rejects IPv4-mapped IPv6 addresses covered by the IPv4 evidence policy", async () => {
    const blockedUrls = [
      "http://[::ffff:127.0.0.1]/review.jpg",
      "http://[::ffff:10.0.0.1]/review.jpg",
      "http://[::ffff:169.254.1.1]/review.jpg",
    ];

    for (const image of blockedUrls) {
      const fetcher = vi.fn(async () => new Response(JSON.stringify({
        place_info: { title: "Demo Coffee", rating: 4.6, reviews: 88 },
        reviews: [{ review_id: "r1", images: [image] }],
      }), { status: 200 }));

      await expect(fetchSerpApiGbp({ dataId: "data-1", placeId: null, apiKey: "secret", language: "en", fetcher }))
        .resolves.toMatchObject({ ok: true, value: { reviews: [{ images: [] }] } });
    }
  });

  it("preserves genuinely public IPv4-mapped IPv6 evidence URLs", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      place_info: { title: "Demo Coffee", rating: 4.6, reviews: 88 },
      reviews: [{ review_id: "r1", images: ["https://[::ffff:8.8.8.8]/review.jpg"] }],
    }), { status: 200 }));

    await expect(fetchSerpApiGbp({ dataId: "data-1", placeId: null, apiKey: "secret", language: "en", fetcher }))
      .resolves.toMatchObject({ ok: true, value: { reviews: [{ images: ["https://[::ffff:808:808]/review.jpg"] }] } });
  });

  it("rejects IPv4-compatible IPv6 addresses covered by the IPv4 evidence policy", async () => {
    const blockedUrls = [
      "http://[::127.0.0.1]/review.jpg", "http://[::7f00:1]/review.jpg",
      "http://[::10.0.0.1]/review.jpg", "http://[::a00:1]/review.jpg",
      "http://[::169.254.1.1]/review.jpg", "http://[::a9fe:101]/review.jpg",
    ];

    for (const image of blockedUrls) {
      const fetcher = vi.fn(async () => new Response(JSON.stringify({
        place_info: { title: "Demo Coffee", rating: 4.6, reviews: 88 },
        reviews: [{ review_id: "r1", images: [image] }],
      }), { status: 200 }));

      await expect(fetchSerpApiGbp({ dataId: "data-1", placeId: null, apiKey: "secret", language: "en", fetcher }))
        .resolves.toMatchObject({ ok: true, value: { reviews: [{ images: [] }] } });
    }
  });

  it("drops private and credential-bearing review links", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      place_info: { title: "Demo Coffee", rating: 4.6, reviews: 88 },
      reviews: [
        { review_id: "private", link: "http://[::7f00:1]/review" },
        { review_id: "credentials", link: "https://user:pass@example.com/review" },
      ],
    }), { status: 200 }));

    await expect(fetchSerpApiGbp({ dataId: "data-1", placeId: null, apiKey: "secret", language: "en", fetcher }))
      .resolves.toMatchObject({ ok: true, value: { reviews: [{ link: null }, { link: null }] } });
  });
});
