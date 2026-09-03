export interface PlacesNewValue {
  placeId: string;
  name: string;
  address: string;
  mapsUrl: string | null;
  rating: number;
  reviewsCount: number;
  categories: string[];
  hoursComplete: boolean;
  photoNames: string[];
  reviews: Array<{
    rating: number;
    text: string;
    time: string;
    ownerResponse?: string;
  }>;
}

export type PlacesNewOutcome =
  | { ok: true; value: PlacesNewValue }
  | { ok: false; code: string; retryable: boolean; httpStatus: number | null };

const FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "googleMapsUri",
  "rating",
  "userRatingCount",
  "types",
  "regularOpeningHours",
  "photos",
  "reviews",
].join(",");

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function mapReviews(value: unknown): PlacesNewValue["reviews"] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 5).map((item) => {
    const review = asObject(item);
    const originalText = asObject(review?.originalText);
    const text = asObject(review?.text);
    const ownerResponse = asObject(review?.ownerResponse);
    const ownerText = stringValue(asObject(ownerResponse?.text)?.text);

    return {
      rating: numberValue(review?.rating),
      text: stringValue(originalText?.text) || stringValue(text?.text),
      time: stringValue(review?.publishTime),
      ...(ownerText ? { ownerResponse: ownerText } : {}),
    };
  });
}

export async function fetchPlacesNewDetails({
  placeId,
  apiKey,
  languageCode,
  fetcher = fetch,
}: {
  placeId: string;
  apiKey: string;
  languageCode: string;
  fetcher?: typeof fetch;
}): Promise<PlacesNewOutcome> {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=${encodeURIComponent(languageCode)}`;

  try {
    const response = await fetcher(url, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      signal: AbortSignal.timeout(8000),
    });
    const body = asObject(await response.json().catch(() => null));

    if (!response.ok) {
      const denied = response.status === 401 || response.status === 403;
      return {
        ok: false,
        code: denied ? "GOOGLE_PLACES_REQUEST_DENIED" : "GOOGLE_PLACES_HTTP_FAILED",
        retryable: response.status === 429 || response.status >= 500,
        httpStatus: response.status,
      };
    }

    const displayName = asObject(body?.displayName);
    const normalizedPlaceId = stringValue(body?.id);
    const normalizedName = stringValue(displayName?.text);
    if (!body || !displayName || !normalizedPlaceId || !normalizedName) {
      return {
        ok: false,
        code: "GOOGLE_PLACES_INVALID_RESPONSE",
        retryable: false,
        httpStatus: response.status,
      };
    }

    const openingHours = asObject(body.regularOpeningHours);
    const photos = Array.isArray(body.photos) ? body.photos : [];
    const categories = Array.isArray(body.types) ? body.types : [];

    return {
      ok: true,
      value: {
        placeId: stringValue(body.id),
        name: stringValue(displayName.text),
        address: stringValue(body.formattedAddress),
        mapsUrl: typeof body.googleMapsUri === "string" ? body.googleMapsUri : null,
        rating: numberValue(body.rating),
        reviewsCount: numberValue(body.userRatingCount),
        categories: categories.filter((type): type is string =>
          typeof type === "string" && !["point_of_interest", "establishment"].includes(type),
        ).slice(0, 10),
        hoursComplete: Array.isArray(openingHours?.weekdayDescriptions) && openingHours.weekdayDescriptions.length > 0,
        photoNames: photos
          .map((photo) => stringValue(asObject(photo)?.name))
          .filter(Boolean)
          .slice(0, 10),
        reviews: mapReviews(body.reviews),
      },
    };
  } catch {
    return {
      ok: false,
      code: "GOOGLE_PLACES_NETWORK_FAILED",
      retryable: true,
      httpStatus: null,
    };
  }
}
