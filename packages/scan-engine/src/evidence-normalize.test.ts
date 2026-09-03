import { describe, expect, it } from "vitest";
import type { RawData } from "@sme-scanner/contracts";
import { evidenceRetentionPolicy, normalizeEvidence } from "./evidence-normalize";

const CAPTURED_AT = "2026-07-21T00:00:00Z";

function fixture(): RawData {
  return {
    ig: {
      profile: {
        username: "demo.cafe",
        full_name: "Demo Cafe",
        bio: "Cafe",
        followers: 120,
        following: 30,
        posts_count: 20,
        profile_pic_url: "https://images.example/profile.jpg",
        is_verified: true,
        external_url: null,
      },
      posts: Array.from({ length: 8 }, (_, index) => ({
        id: `p-${index}`,
        caption: "Post",
        media_type: "GraphImage",
        like_count: 5,
        comment_count: 1,
        posted_at: "2026-07-20T00:00:00Z",
        thumbnail_url: `https://images.example/post-${index}.jpg`,
        permalink: `https://www.instagram.com/p/code${index}/`,
      })),
      reels: Array.from({ length: 8 }, (_, index) => ({
        id: `reel-${index}`,
        caption: "Reel",
        play_count: 12,
        like_count: 5,
        comment_count: 1,
        posted_at: "2026-07-20T00:00:00Z",
        thumbnail_url: `https://images.example/reel-${index}.jpg`,
        permalink: `https://www.instagram.com/reel/code${index}/`,
      })),
      highlights: Array.from({ length: 10 }, (_, index) => ({
        id: `highlight-${index}`,
        title: "Menu",
        cover_url: `https://images.example/highlight-${index}.jpg`,
        items_count: 2,
      })),
      stories: Array.from({ length: 8 }, (_, index) => ({
        id: `story-${index}`,
        media_type: "GraphImage",
        thumbnail_url: `https://images.example/story-${index}.jpg`,
        posted_at: "2026-07-20T00:00:00Z",
        permalink: `https://www.instagram.com/stories/demo.cafe/story-${index}/`,
      })),
      stories_count: 8,
    },
    gbp: {
      source: "serpapi",
      name: "Demo",
      place_id: "place-1",
      address: "Central",
      maps_url: "https://maps.example/demo",
      data_id: "data-1",
      data_cid: "cid-1",
      rating: 4.5,
      reviews_count: 8,
      categories: ["Cafe"],
      photos: Array.from({ length: 8 }, (_, index) => ({
        id: `photo-${index}`,
        image_url: `https://images.example/photo-${index}.jpg`,
        source_url: "https://maps.example/demo",
        attribution: "Google Maps" as const,
      })),
      posts: Array.from({ length: 5 }, (_, index) => ({
        id: `google-post-${index}`,
        text: "Update",
        published_at: "2026-07-20T00:00:00Z",
        image_url: `https://images.example/google-post-${index}.jpg`,
        link: "https://maps.example/post",
        action_link: "https://demo.example/order",
      })),
      reviews: Array.from({ length: 7 }, (_, index) => ({
        id: `review-${index}`,
        link: "https://maps.example/review",
        rating: 5,
        text: "Great",
        time: "2026-07-20T00:00:00Z",
        images: [`https://images.example/review-${index}.jpg`],
        owner_response: "Thanks",
      })),
    },
  };
}

describe("normalizeEvidence", () => {
  it("enforces every provider and evidence-type cardinality limit", () => {
    const candidates = normalizeEvidence(fixture(), CAPTURED_AT, {
      instagram: true,
      googleMaps: true,
    });

    const count = (provider: string, evidenceType: string) => candidates.filter(
      (item) => item.provider === provider && item.evidenceType === evidenceType,
    ).length;
    expect(count("instagram", "profile")).toBe(1);
    expect(count("instagram", "post")).toBe(6);
    expect(count("instagram", "reel")).toBe(6);
    expect(count("instagram", "story")).toBe(6);
    expect(count("instagram", "highlight")).toBe(8);
    expect(count("google_maps", "photo")).toBe(6);
    expect(count("google_maps", "post")).toBe(3);
    expect(count("google_maps", "review")).toBe(5);
    expect(candidates[0]).toEqual(expect.objectContaining({
      capturedAt: CAPTURED_AT,
      retention: "snapshot_permitted",
    }));
  });

  it("fails closed unless each retention flag is the exact string true", () => {
    expect(evidenceRetentionPolicy({})).toEqual({ instagram: false, googleMaps: false });
    expect(evidenceRetentionPolicy({
      EVIDENCE_SNAPSHOT_INSTAGRAM_ALLOWED: "TRUE",
      EVIDENCE_SNAPSHOT_GOOGLE_MAPS_ALLOWED: " true",
    })).toEqual({ instagram: false, googleMaps: false });
    expect(evidenceRetentionPolicy({
      EVIDENCE_SNAPSHOT_INSTAGRAM_ALLOWED: "true",
      EVIDENCE_SNAPSHOT_GOOGLE_MAPS_ALLOWED: "true",
    })).toEqual({ instagram: true, googleMaps: true });

    expect(normalizeEvidence(fixture(), CAPTURED_AT).every(
      (candidate) => candidate.retention === "metadata_only",
    )).toBe(true);
  });

  it("keeps only credential-free public HTTP(S) URLs without secret query parameters", () => {
    const raw = fixture();
    raw.ig!.profile.profile_pic_url = "http://127.0.0.1/private";
    raw.ig!.posts[0]!.thumbnail_url = "http://192.0.2.1/private";
    raw.ig!.posts[0]!.permalink = "https://user:pass@instagram.com/p/code/";
    raw.ig!.reels[0]!.thumbnail_url = "http://[::1]/private";
    raw.ig!.stories![0]!.permalink = "https://instagram.com/stories/demo/1/?access_token=secret";
    raw.ig!.highlights[0]!.cover_url = "file:///etc/passwd";
    raw.gbp!.maps_url = "http://169.254.169.254/latest/meta-data";
    raw.gbp!.photos![0]!.image_url = "http://198.51.100.4/photo";
    raw.gbp!.posts![0]!.link = "https://maps.example/post?api_key=secret";
    raw.gbp!.posts![0]!.action_link = "https://demo.example/order?token=secret";
    raw.gbp!.reviews[0]!.images = ["http://[::ffff:127.0.0.1]/private"];

    const serialized = JSON.stringify(normalizeEvidence(raw, CAPTURED_AT, {
      instagram: false,
      googleMaps: false,
    }));
    expect(serialized).not.toContain("127.0.0.1");
    expect(serialized).not.toContain("192.0.2.1");
    expect(serialized).not.toContain("169.254.169.254");
    expect(serialized).not.toContain("198.51.100.4");
    expect(serialized).not.toContain("::1");
    expect(serialized).not.toContain("api_key");
    expect(serialized).not.toContain("access_token");
    expect(serialized).not.toContain("token=secret");
    expect(serialized).not.toContain("user:pass");
    expect(serialized).not.toContain("file:");
  });


  it("rejects sensitive query names including bare key while preserving legitimate provider parameters", () => {
    const sensitiveNames = [
      "key",
      "apikey",
      "api-key",
      "api_key",
      "access-token",
      "client_secret",
      "x-amz-signature",
      "x-goog-credential",
      "refresh_token",
      "refreshToken",
      "id_token",
      "idToken",
      "api_secret",
      "apiSecret",
      "private_key",
      "privateKey",
      "auth[token]",
      "jwt",
    ];

    for (const name of sensitiveNames) {
      const raw = fixture();
      raw.ig!.posts[0]!.permalink =
        "https://www.instagram.com/p/code0/?" + encodeURIComponent(name) + "=SUPER_SECRET";
      const post = normalizeEvidence(raw, CAPTURED_AT, {
        instagram: false,
        googleMaps: false,
      }).find((item) => item.provider === "instagram" && item.evidenceType === "post");
      expect.soft(post?.sourceUrl, name).toBeNull();
    }

    const raw = fixture();
    raw.gbp!.maps_url = "https://maps.example/demo?hl=en&cid=123&utm_source=profile";
    raw.gbp!.photos![0]!.source_url = null;
    const photo = normalizeEvidence(raw, CAPTURED_AT, {
      instagram: false,
      googleMaps: false,
    }).find((item) => item.evidenceType === "photo");
    expect(photo?.sourceUrl).toBe(
      "https://maps.example/demo?hl=en&cid=123&utm_source=profile",
    );
  });


  it("blocks credential-family keys across URL fields and strips every accepted fragment", () => {
    const raw = fixture();
    raw.ig!.posts[0]!.permalink =
      "https://www.instagram.com/p/code0/?refresh_token=SUPER_SECRET";
    raw.ig!.reels[0]!.thumbnail_url =
      "https://images.example/reel.jpg?id_token=SUPER_SECRET";
    raw.gbp!.maps_url =
      "https://maps.example/demo?hl=en&cid=123&utm_source=profile&width=640#section";
    raw.gbp!.photos![0]!.source_url =
      "https://maps.example/photo?private_key=SUPER_SECRET";
    raw.gbp!.photos![0]!.image_url =
      "https://images.example/photo.jpg?auth%5Btoken%5D=SUPER_SECRET";
    raw.gbp!.posts![0]!.action_link =
      "https://demo.example/order?api_secret=SUPER_SECRET";
    raw.gbp!.posts![1]!.link =
      "https://maps.example/post?hl=en&cid=123&utm_source=profile&width=640&monkey=banana&keyboard=qwerty#details";
    raw.gbp!.posts![1]!.action_link =
      "https://demo.example/order?width=640&keyboard=qwerty#cta";
    raw.gbp!.reviews[0]!.link =
      "https://maps.example/review#access_token=SUPER_SECRET";

    const candidates = normalizeEvidence(raw, CAPTURED_AT, {
      instagram: false,
      googleMaps: false,
    });
    const instagramPost = candidates.find((item) => item.sourceId === "p-0");
    const instagramReel = candidates.find((item) => item.sourceId === "reel-0");
    const photo = candidates.find((item) => item.sourceId === "photo-0");
    const unsafeGooglePost = candidates.find((item) => item.sourceId === "google-post-0");
    const safeGooglePost = candidates.find((item) => item.sourceId === "google-post-1");
    const review = candidates.find((item) => item.sourceId === "review-0");

    expect.soft(instagramPost?.sourceUrl).toBeNull();
    expect.soft(instagramReel?.mediaUrl).toBeNull();
    expect.soft(photo?.sourceUrl).toBe(
      "https://maps.example/demo?hl=en&cid=123&utm_source=profile&width=640",
    );
    expect.soft(photo?.mediaUrl).toBeNull();
    expect.soft(unsafeGooglePost?.metadata.actionLink).toBeNull();
    expect.soft(review?.sourceUrl).toBe("https://maps.example/review");
    expect.soft(safeGooglePost?.sourceUrl).toBe(
      "https://maps.example/post?hl=en&cid=123&utm_source=profile&width=640&monkey=banana&keyboard=qwerty",
    );
    expect.soft(safeGooglePost?.metadata.actionLink).toBe(
      "https://demo.example/order?width=640&keyboard=qwerty",
    );

    const serialized = JSON.stringify(candidates);
    expect.soft(serialized).not.toContain("SUPER_SECRET");
    expect.soft(serialized).not.toContain("#");
  });


  it("rejects exact compact credential names across URL fields without substring false positives", () => {
    const cases: Array<{
      name: string;
      field: "source" | "media" | "action";
    }> = [
      { name: "accesstoken", field: "source" },
      { name: "clientsecret", field: "source" },
      { name: "refreshtoken", field: "media" },
      { name: "apisecret", field: "media" },
      { name: "idtoken", field: "action" },
      { name: "privatekey", field: "action" },
    ];

    for (const item of cases) {
      const raw = fixture();
      if (item.field === "source") {
        raw.ig!.posts[0]!.permalink =
          "https://www.instagram.com/p/code0/?" + item.name + "=SUPER_SECRET";
      } else if (item.field === "media") {
        raw.ig!.reels[0]!.thumbnail_url =
          "https://images.example/reel.jpg?" + item.name + "=SUPER_SECRET";
      } else {
        raw.gbp!.posts![0]!.action_link =
          "https://demo.example/order?" + item.name + "=SUPER_SECRET";
      }

      const candidates = normalizeEvidence(raw, CAPTURED_AT, {
        instagram: false,
        googleMaps: false,
      });
      const value = item.field === "source"
        ? candidates.find((candidate) => candidate.sourceId === "p-0")?.sourceUrl
        : item.field === "media"
          ? candidates.find((candidate) => candidate.sourceId === "reel-0")?.mediaUrl
          : candidates.find((candidate) => candidate.sourceId === "google-post-0")
            ?.metadata.actionLink;
      expect.soft(value, item.name + ":" + item.field).toBeNull();
    }

    const safeRaw = fixture();
    safeRaw.ig!.posts[0]!.permalink =
      "https://www.instagram.com/p/code0/?monkey=banana&keyboard=qwerty";
    safeRaw.ig!.reels[0]!.thumbnail_url =
      "https://images.example/reel.jpg?monkey=banana&keyboard=qwerty";
    safeRaw.gbp!.posts![0]!.action_link =
      "https://demo.example/order?monkey=banana&keyboard=qwerty";
    const safe = normalizeEvidence(safeRaw, CAPTURED_AT, {
      instagram: false,
      googleMaps: false,
    });

    expect.soft(safe.find((candidate) => candidate.sourceId === "p-0")?.sourceUrl)
      .toBe("https://www.instagram.com/p/code0/?monkey=banana&keyboard=qwerty");
    expect.soft(safe.find((candidate) => candidate.sourceId === "reel-0")?.mediaUrl)
      .toBe("https://images.example/reel.jpg?monkey=banana&keyboard=qwerty");
    expect.soft(
      safe.find((candidate) => candidate.sourceId === "google-post-0")
        ?.metadata.actionLink,
    ).toBe("https://demo.example/order?monkey=banana&keyboard=qwerty");
  });

  it("normalizes legacy Instagram raw data when stories is absent", () => {
    const legacy = fixture();
    delete (legacy.ig as Partial<NonNullable<RawData["ig"]>>).stories;

    expect(() => normalizeEvidence(legacy, CAPTURED_AT, {
      instagram: false,
      googleMaps: false,
    })).not.toThrow();
    expect(normalizeEvidence(legacy, CAPTURED_AT, {
      instagram: false,
      googleMaps: false,
    }).filter((item) => item.evidenceType === "story")).toHaveLength(0);
  });

  it("deduplicates each evidence type before applying its cardinality cap", () => {
    const raw = fixture();
    const duplicateFirst = <T extends object>(items: T[]): T[] => [
      items[0]!,
      { ...items[0]! },
      ...items.slice(1),
    ];

    raw.ig!.posts = duplicateFirst(raw.ig!.posts);
    raw.ig!.reels = duplicateFirst(raw.ig!.reels);
    raw.ig!.stories = duplicateFirst(raw.ig!.stories!);
    raw.ig!.highlights = duplicateFirst(raw.ig!.highlights);
    raw.gbp!.photos = duplicateFirst(raw.gbp!.photos!);
    raw.gbp!.posts = duplicateFirst(raw.gbp!.posts!);
    raw.gbp!.reviews = duplicateFirst(raw.gbp!.reviews);

    const candidates = normalizeEvidence(raw, CAPTURED_AT, {
      instagram: false,
      googleMaps: false,
    });
    const expected: Array<[string, string, number]> = [
      ["instagram", "post", 6],
      ["instagram", "reel", 6],
      ["instagram", "story", 6],
      ["instagram", "highlight", 8],
      ["google_maps", "photo", 6],
      ["google_maps", "post", 3],
      ["google_maps", "review", 5],
    ];

    for (const [provider, evidenceType, limit] of expected) {
      const matches = candidates.filter(
        (item) => item.provider === provider && item.evidenceType === evidenceType,
      );
      expect(matches, provider + ":" + evidenceType).toHaveLength(limit);
      expect(
        new Set(matches.map((item) => item.sourceId)).size,
        provider + ":" + evidenceType,
      ).toBe(limit);
    }
  });

  it("uses bounded stable IDs or deterministic fallbacks and drops identity-less rows", () => {
    const raw = fixture();
    raw.ig!.posts = [
      { ...raw.ig!.posts[0]!, id: "   ", permalink: "https://www.instagram.com/p/stable/" },
      { ...raw.ig!.posts[1]!, id: "   ", permalink: null, thumbnail_url: undefined },
      { ...raw.ig!.posts[2]!, id: "x".repeat(500) },
    ];
    raw.gbp!.reviews = [
      { ...raw.gbp!.reviews[0]!, id: " ", link: "https://maps.example/review/stable" },
      { ...raw.gbp!.reviews[1]!, id: " ", link: null, images: [], text: "", time: "" },
    ];

    const first = normalizeEvidence(raw, CAPTURED_AT, { instagram: false, googleMaps: false });
    const second = normalizeEvidence(raw, CAPTURED_AT, { instagram: false, googleMaps: false });
    const posts = first.filter((item) => item.provider === "instagram" && item.evidenceType === "post");
    const reviews = first.filter((item) => item.evidenceType === "review");

    expect(posts).toHaveLength(2);
    expect(reviews).toHaveLength(1);
    expect(posts[0]!.sourceId).toBe(second.find(
      (item) => item.provider === "instagram" && item.evidenceType === "post",
    )!.sourceId);
    expect(posts.every((item) => item.sourceId.trim().length > 0 && item.sourceId.length <= 200)).toBe(true);
    expect(reviews[0]!.sourceId).toMatch(/^sha256:/);
  });

  it("bounds text and whitelists flat metadata without debug, secret, body, or nested fields", () => {
    const raw = fixture() as RawData & Record<string, unknown>;
    raw.ig!.profile.bio = "b".repeat(5_000);
    raw.ig!.profile.full_name = "n".repeat(1_000);
    raw.ig!.posts[0]!.caption = "p".repeat(5_000);
    raw.gbp!.reviews[0]!.owner_response = "o".repeat(5_000);
    Object.assign(raw.ig!, {
      debug_posts_api_keys: ["SUPER_SECRET"],
      api_key: "SUPER_SECRET",
      raw_body: "SUPER_SECRET",
      nested: { secret: "SUPER_SECRET" },
    });
    Object.assign(raw.ig!.posts[0]!, {
      debug: "SUPER_SECRET",
      access_token: "SUPER_SECRET",
      raw: { secret: "SUPER_SECRET" },
    });

    const candidates = normalizeEvidence(raw, CAPTURED_AT, { instagram: false, googleMaps: false });
    const profile = candidates.find((item) => item.evidenceType === "profile")!;
    const post = candidates.find(
      (item) => item.provider === "instagram" && item.evidenceType === "post",
    )!;
    const review = candidates.find((item) => item.evidenceType === "review")!;
    const serialized = JSON.stringify(candidates);

    expect(profile.text).toHaveLength(2_000);
    expect(profile.metadata.fullName).toHaveLength(200);
    expect(post.text).toHaveLength(2_000);
    expect(review.metadata.ownerResponse).toHaveLength(2_000);
    expect(Object.values(review.metadata).every(
      (value) => value === null || Array.isArray(value) || typeof value !== "object",
    )).toBe(true);
    expect(serialized).not.toContain("SUPER_SECRET");
    expect(serialized).not.toMatch(/debug|api_key|access_token|raw_body|nested/i);
  });
});
