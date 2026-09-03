import { describe, expect, it, vi } from "vitest";
import { fetchSerpApiGoogleEvidence } from "./serpapi-google-evidence";

const options = {
  dataId: "data-1",
  mapsUrl: "https://maps.example/demo",
  apiKey: "secret-api-key",
  language: "zh-TW",
};

describe("fetchSerpApiGoogleEvidence", () => {
  it("collects bounded Google photos and merchant posts without exposing provider metadata", async () => {
    const secretPhotoMetadata = "https://serpapi.example/photo/1?api_key=secret-api-key";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        photos: Array.from({ length: 8 }, (_, index) => ({
          image: `https://images.example/photo-${index}.jpg`,
          thumbnail: `https://images.example/photo-${index}-thumb.jpg`,
          photo_meta_serpapi_link: index === 0 ? secretPhotoMetadata : `provider-photo-${index}`,
        })),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        posts: Array.from({ length: 5 }, (_, index) => ({
          post_id: `post-${index}`,
          description: index === 0 ? "New menu" : `Post ${index}`,
          date: "2026-07-20",
          image: `https://images.example/post-${index}.jpg`,
          link: `https://maps.example/post/${index}`,
          action: { link: `https://example.com/menu/${index}` },
        })),
      }), { status: 200 }));

    const result = await fetchSerpApiGoogleEvidence({ ...options, fetcher });

    expect(result.photos).toHaveLength(6);
    expect(result.photos[0]).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{64}$/),
      image_url: "https://images.example/photo-0.jpg",
      source_url: "https://maps.example/demo",
      attribution: "Google Maps",
    });
    expect(result.posts).toHaveLength(3);
    expect(result.posts[0]).toEqual({
      id: "post-0",
      text: "New menu",
      published_at: "2026-07-20",
      image_url: "https://images.example/post-0.jpg",
      link: "https://maps.example/post/0",
      action_link: "https://example.com/menu/0",
    });
    expect(JSON.stringify(result)).not.toContain(secretPhotoMetadata);
    expect(JSON.stringify(result)).not.toContain("secret-api-key");
    expect(fetcher.mock.calls.map((call) => String(call[0]))).toEqual([
      expect.stringContaining("engine=google_maps_photos"),
      expect.stringContaining("engine=google_maps_posts"),
    ]);
  });

  it("keeps photos when posts fail and exposes only a sanitized failure code", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        photos: [{ image: "https://images.example/photo.jpg" }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: "https://serpapi.com/search.json?api_key=secret-api-key",
      }), { status: 500 }));

    const result = await fetchSerpApiGoogleEvidence({ ...options, language: "en", fetcher });

    expect(result.photos).toHaveLength(1);
    expect(result.posts).toEqual([]);
    expect(result.failures).toEqual(["SERPAPI_GOOGLE_POSTS_FAILED"]);
    expect(JSON.stringify(result)).not.toContain("secret-api-key");
  });

  it("keeps posts when the photos request throws a secret-bearing error", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("https://serpapi.com/search.json?api_key=secret-api-key"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        posts: [{ post_id: "post-1", description: "Open today", date: "2026-07-21" }],
      }), { status: 200 }));

    const result = await fetchSerpApiGoogleEvidence({ ...options, fetcher });

    expect(result.photos).toEqual([]);
    expect(result.posts).toEqual([{
      id: "post-1",
      text: "Open today",
      published_at: "2026-07-21",
      image_url: null,
      link: null,
      action_link: null,
    }]);
    expect(result.failures).toEqual(["SERPAPI_GOOGLE_PHOTOS_FAILED"]);
    expect(JSON.stringify(result)).not.toContain("secret-api-key");
  });

  it("drops malformed rows, bounds text, and uses a sanitized public maps attribution URL", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        photos: [null, {}, { image: 42 }, { thumbnail: "https://images.example/fallback.jpg" }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        posts: [null, {}, {
          post_id: "post-1",
          description: "x".repeat(3_000),
          date: "d".repeat(200),
          action: "malformed",
        }],
      }), { status: 200 }));

    const result = await fetchSerpApiGoogleEvidence({
      ...options,
      mapsUrl: "http://localhost/private",
      fetcher,
    });

    expect(result.photos).toEqual([{
      id: expect.stringMatching(/^[0-9a-f]{64}$/),
      image_url: "https://images.example/fallback.jpg",
      source_url: null,
      attribution: "Google Maps",
    }]);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]?.text.length).toBeLessThanOrEqual(2_000);
    expect(result.posts[0]?.published_at.length).toBeLessThanOrEqual(100);
    expect(result.posts[0]?.action_link).toBeNull();
  });

  it("keeps only credential-free public HTTP(S) media and action URLs", async () => {
    const blockedUrls = [
      "http://localhost/media", "http://sub.localhost/media", "http://127.0.0.1/media",
      "http://10.0.0.1/media", "http://169.254.1.1/media", "http://172.16.0.1/media",
      "http://192.168.0.1/media", "http://[::1]/media", "http://[fe80::1]/media",
      "http://[fc00::1]/media", "http://[::ffff:127.0.0.1]/media",
      "http://[::7f00:1]/media", "https://user:pass@example.com/media", "javascript:alert(1)",
    ];

    for (const blockedUrl of blockedUrls) {
      const fetcher = vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ photos: [{ image: blockedUrl }] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          posts: [{ post_id: "post-1", image: blockedUrl, link: blockedUrl, action: { link: blockedUrl } }],
        }), { status: 200 }));

      const result = await fetchSerpApiGoogleEvidence({ ...options, fetcher });
      expect(result.photos).toEqual([]);
      expect(result.posts).toEqual([{
        id: "post-1",
        text: "",
        published_at: "",
        image_url: null,
        link: null,
        action_link: null,
      }]);
    }
  });
  it("rejects special-use non-global IPv4 URLs in every evidence URL field", async () => {
    const blockedUrls = [
      "http://192.0.0.1/evidence", "http://192.0.2.1/evidence",
      "http://192.88.99.1/evidence", "http://198.18.0.1/evidence",
      "http://198.51.100.1/evidence", "http://203.0.113.1/evidence",
    ];

    for (const blockedUrl of blockedUrls) {
      const fetcher = vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({
          photos: [
            { image: blockedUrl },
            { image: "https://images.example/public.jpg" },
          ],
        }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          posts: [{ post_id: "post-1", image: blockedUrl, link: blockedUrl, action: { link: blockedUrl } }],
        }), { status: 200 }));

      const result = await fetchSerpApiGoogleEvidence({ ...options, mapsUrl: blockedUrl, fetcher });
      expect(result.photos).toEqual([expect.objectContaining({
        image_url: "https://images.example/public.jpg",
        source_url: null,
      })]);
      expect(result.posts).toEqual([expect.objectContaining({
        image_url: null,
        link: null,
        action_link: null,
      })]);
    }
  });

  it("asks Google's CDN for a bounded render instead of the camera original", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        photos: [
          { image: "https://lh5.googleusercontent.com/p/AF1QipOx7F8=w4032-h3024-k-no" },
          { image: "https://play-lh.googleusercontent.com/abc=s4096-rw" },
          { image: "https://lh3.googleusercontent.com/gps-cs-s/AB=w203-h152-k-no" },
          { image: "https://lh3.googleusercontent.com/p/AF1QipPgif1o" },
          { image: "https://images.example/original.jpg=w4032-h3024-k-no" },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        posts: [{
          post_id: "post-1",
          image: "https://lh5.googleusercontent.com/p/AF1QipZZ=w4032-h3024-k-no",
        }],
      }), { status: 200 }));

    const result = await fetchSerpApiGoogleEvidence({ ...options, fetcher });

    expect(result.photos.map((photo) => photo.image_url)).toEqual([
      "https://lh5.googleusercontent.com/p/AF1QipOx7F8=w1600-h1200-k-no",
      "https://play-lh.googleusercontent.com/abc=s1600-rw",
      "https://lh3.googleusercontent.com/gps-cs-s/AB=w203-h152-k-no",
      "https://lh3.googleusercontent.com/p/AF1QipPgif1o",
      "https://images.example/original.jpg=w4032-h3024-k-no",
    ]);
    expect(result.posts[0]?.image_url)
      .toBe("https://lh5.googleusercontent.com/p/AF1QipZZ=w1600-h1200-k-no");
  });

  it("bounds a Google thumbnail fallback and leaves malformed size options alone", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        photos: [
          { thumbnail: "https://lh5.googleusercontent.com/p/AAA=w2400-h2400-k-no" },
          { image: "https://lh5.googleusercontent.com/p/BBB=wide-hero-k-no" },
          { image: "https://lh5.googleusercontent.com/p/CCC=s1600" },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ posts: [] }), { status: 200 }));

    const result = await fetchSerpApiGoogleEvidence({ ...options, fetcher });

    expect(result.photos.map((photo) => photo.image_url)).toEqual([
      "https://lh5.googleusercontent.com/p/AAA=w1600-h1600-k-no",
      "https://lh5.googleusercontent.com/p/BBB=wide-hero-k-no",
      "https://lh5.googleusercontent.com/p/CCC=s1600",
    ]);
  });

  it("falls back from blank provider identities without photo ID collisions", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        photos: [
          { image: "https://images.example/a.jpg", photo_meta_serpapi_link: "" },
          { image: "https://images.example/b.jpg", photo_meta_serpapi_link: "" },
          { image: "https://images.example/c.jpg", photo_meta_serpapi_link: "   " },
          { image: "https://images.example/d.jpg", photo_meta_serpapi_link: "   " },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ posts: [] }), { status: 200 }));

    const result = await fetchSerpApiGoogleEvidence({ ...options, fetcher });
    expect(new Set(result.photos.map((photo) => photo.id)).size).toBe(4);
  });

  it("continues past blank post IDs to public link or image-derived identity", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ photos: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        posts: [
          { post_id: "   ", id: "	", link: "https://maps.example/post/from-link" },
          { post_id: " ", id: "", image: "https://images.example/post.jpg" },
          { post_id: " ", id: "   ", link: "http://127.0.0.1/private" },
        ],
      }), { status: 200 }));

    const result = await fetchSerpApiGoogleEvidence({ ...options, fetcher });
    expect(result.posts).toHaveLength(2);
    expect(result.posts[0]?.id).toBe("https://maps.example/post/from-link");
    expect(result.posts[1]?.id).toMatch(/^[0-9a-f]{64}$/);
    expect(result.posts.every((post) => post.id.trim().length > 0)).toBe(true);
  });

});
