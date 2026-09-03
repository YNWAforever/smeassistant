import { describe, expect, it, vi } from "vitest";
import { fetchPlacesNewDetails } from "./google-places-new";

describe("fetchPlacesNewDetails", () => {
  it("maps Places New fields and uses a field-mask header", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id: "place-1",
      displayName: { text: "Demo Coffee" },
      formattedAddress: "1 Queen's Road Central",
      googleMapsUri: "https://maps.google.com/?cid=1",
      rating: 4.7,
      userRatingCount: 42,
      types: ["cafe", "point_of_interest"],
      regularOpeningHours: { weekdayDescriptions: ["Monday"] },
      photos: [{ name: "places/place-1/photos/photo-1" }],
    }), { status: 200 }));

    const outcome = await fetchPlacesNewDetails({
      placeId: "place-1",
      apiKey: "secret",
      languageCode: "zh-TW",
      fetcher,
    });

    expect(outcome).toMatchObject({
      ok: true,
      value: { name: "Demo Coffee", rating: 4.7, reviewsCount: 42 },
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://places.googleapis.com/v1/places/place-1?languageCode=zh-TW",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Goog-FieldMask": expect.stringContaining("userRatingCount"),
        }),
      }),
    );
  });

  it("returns a sanitized denied code", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 403 }));

    await expect(fetchPlacesNewDetails({
      placeId: "place-1",
      apiKey: "secret",
      languageCode: "en",
      fetcher,
    })).resolves.toEqual({
      ok: false,
      code: "GOOGLE_PLACES_REQUEST_DENIED",
      retryable: false,
      httpStatus: 403,
    });
  });

  it("rejects a successful response with non-string identity fields", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id: 1,
      displayName: { text: 2 },
    }), { status: 200 }));

    await expect(fetchPlacesNewDetails({
      placeId: "place-1",
      apiKey: "secret",
      languageCode: "en",
      fetcher,
    })).resolves.toEqual({
      ok: false,
      code: "GOOGLE_PLACES_INVALID_RESPONSE",
      retryable: false,
      httpStatus: 200,
    });
  });

  it("caps provider categories", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id: "place-1",
      displayName: { text: "Demo Coffee" },
      types: Array.from({ length: 12 }, (_, index) => `type-${index}`),
    }), { status: 200 }));

    const outcome = await fetchPlacesNewDetails({
      placeId: "place-1",
      apiKey: "secret",
      languageCode: "en",
      fetcher,
    });

    expect(outcome).toMatchObject({
      ok: true,
      value: { categories: Array.from({ length: 10 }, (_, index) => `type-${index}`) },
    });
  });
});
