import { describe, expect, it, vi } from "vitest";
import {
  deleteReply,
  findLocationForPlace,
  GbpError,
  getReview,
  listUnrepliedReviews,
  putReply,
  REVIEWS_BASE,
  reviewNameIsUnder,
  sameReply,
} from "./google-reviews";

type FakeResponse = { ok: boolean; status?: number; json?: unknown };

// Typed with fetch's own parameters so `.mock.calls` is `[url, init]`.
function fetchReturning(responses: FakeResponse[]) {
  let call = 0;
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const response = responses[call] ?? responses[responses.length - 1]!;
    call += 1;
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => response.json ?? {},
    } as Response;
  });
}

function fetchRejecting(error: unknown) {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    throw error;
  });
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

const LOCATION = { accountName: "accounts/1", locationName: "locations/2" };
const REVIEW_NAME = "accounts/1/locations/2/reviews/r1";

function review(id: string, extra: Record<string, unknown> = {}) {
  return {
    name: `accounts/1/locations/2/reviews/${id}`,
    reviewer: { displayName: `Reviewer ${id}` },
    starRating: "FOUR",
    comment: `Comment ${id}`,
    createTime: "2026-10-01T00:00:00Z",
    updateTime: "2026-10-01T00:00:00Z",
    ...extra,
  };
}

describe("findLocationForPlace", () => {
  it("returns account and location for a matching placeId across a second accounts page; null when absent", async () => {
    const pages: FakeResponse[] = [
      { ok: true, json: { accounts: [{ name: "accounts/111" }], nextPageToken: "accounts-page-2" } },
      { ok: true, json: { accounts: [{ name: "accounts/222" }] } },
      { ok: true, json: { locations: [{ name: "locations/aaa", metadata: { placeId: "place-a" } }] } },
      { ok: true, json: { locations: [{ name: "locations/bbb", metadata: { placeId: "place-b" } }] } },
    ];

    await expect(findLocationForPlace("tok", "place-b", fetchReturning(pages))).resolves.toEqual({
      accountName: "accounts/222",
      locationName: "locations/bbb",
    });
    await expect(findLocationForPlace("tok", "place-z", fetchReturning(pages))).resolves.toBeNull();
  });

  it("maps a listing failure to a GbpError code rather than a bare Error", async () => {
    const error = await caught(findLocationForPlace("tok", "place-a", fetchReturning([{ ok: false, status: 403 }])));
    expect(error).toBeInstanceOf(GbpError);
    expect((error as GbpError).code).toBe("forbidden");
  });
});

describe("listUnrepliedReviews", () => {
  it("skips replied reviews, stops at 50 and at 3 pages, maps star enums and truncates excerpts to 200 code points", async () => {
    const longComment = "😀".repeat(250); // 250 code points, 500 UTF-16 units
    const firstPage = [
      review("a", { starRating: "ONE", comment: longComment }),
      review("b", { reviewReply: { comment: "Thanks!", updateTime: "2026-10-02T00:00:00Z" } }),
      review("c", { starRating: "STAR_RATING_UNSPECIFIED", reviewReply: { comment: "" } }),
      review("d", { starRating: "FIVE", comment: undefined, reviewer: {} }),
    ];
    const fetchImpl = fetchReturning([
      { ok: true, json: { reviews: firstPage, nextPageToken: "p2" } },
      { ok: true, json: { reviews: [review("e", { starRating: "TWO" })], nextPageToken: "p3" } },
      { ok: true, json: { reviews: [review("f", { starRating: "THREE" })], nextPageToken: "p4" } },
      { ok: true, json: { reviews: [review("never")] } },
    ]);

    const targets = await listUnrepliedReviews("tok", LOCATION, fetchImpl);

    // Three pages at most, never the fourth.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(targets.map((t) => t.reviewName)).toEqual([
      "accounts/1/locations/2/reviews/a",
      "accounts/1/locations/2/reviews/c",
      "accounts/1/locations/2/reviews/d",
      "accounts/1/locations/2/reviews/e",
      "accounts/1/locations/2/reviews/f",
    ]);
    expect(targets.map((t) => t.starRating)).toEqual([1, null, 5, 2, 3]);
    expect([...targets[0]!.excerpt].length).toBe(200);
    expect(targets[0]!.excerpt).toBe("😀".repeat(200));
    expect(targets[2]!.excerpt).toBe("");
    expect(targets[2]!.reviewer).toBe("");
    expect(targets[0]!.reviewer).toBe("Reviewer a");
    expect(targets[0]!.createTime).toBe("2026-10-01T00:00:00Z");

    const firstUrl = new URL(fetchImpl.mock.calls[0]![0] as string);
    expect(`${firstUrl.origin}${firstUrl.pathname}`).toBe(`${REVIEWS_BASE}/accounts/1/locations/2/reviews`);
    expect(firstUrl.searchParams.get("pageSize")).toBe("50");
    expect(firstUrl.searchParams.get("orderBy")).toBe("updateTime desc");
    expect(firstUrl.searchParams.get("pageToken")).toBeNull();
    const secondUrl = new URL(fetchImpl.mock.calls[1]![0] as string);
    expect(secondUrl.searchParams.get("pageToken")).toBe("p2");
  });

  it("stops at 50 targets even when the page holds more", async () => {
    const many = Array.from({ length: 50 }, (_, i) => review(`x${i}`));
    const fetchImpl = fetchReturning([
      { ok: true, json: { reviews: many, nextPageToken: "p2" } },
      { ok: true, json: { reviews: [review("y")] } },
    ]);

    const targets = await listUnrepliedReviews("tok", LOCATION, fetchImpl);

    expect(targets).toHaveLength(50);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const sixty = Array.from({ length: 60 }, (_, i) => review(`z${i}`));
    const capped = await listUnrepliedReviews("tok", LOCATION, fetchReturning([{ ok: true, json: { reviews: sixty } }]));
    expect(capped).toHaveLength(50);
    expect(capped[49]!.reviewName).toBe("accounts/1/locations/2/reviews/z49");
  });

  it("drops a review whose name is missing or not under the requested location", async () => {
    const fetchImpl = fetchReturning([
      {
        ok: true,
        json: {
          reviews: [
            review("ok"),
            { ...review("nameless"), name: undefined },
            { ...review("elsewhere"), name: "accounts/1/locations/9/reviews/elsewhere" },
          ],
        },
      },
    ]);

    const targets = await listUnrepliedReviews("tok", LOCATION, fetchImpl);

    expect(targets.map((t) => t.reviewName)).toEqual(["accounts/1/locations/2/reviews/ok"]);
  });
});

describe("status and transport error mapping", () => {
  it("status mapping: 401 unauthorized, 403 forbidden, 404 not_found, 429 rate_limited, 500 provider_error", async () => {
    const cases: Array<[number, string]> = [
      [401, "unauthorized"],
      [403, "forbidden"],
      [404, "not_found"],
      [429, "rate_limited"],
      [500, "provider_error"],
      [502, "provider_error"],
      [400, "provider_error"],
    ];
    for (const [status, code] of cases) {
      const fetchImpl = fetchReturning([{ ok: false, status }]);
      for (const call of [
        () => getReview("tok", REVIEW_NAME, fetchImpl),
        () => listUnrepliedReviews("tok", LOCATION, fetchImpl),
        () => putReply("tok", REVIEW_NAME, "hi", fetchImpl),
      ]) {
        const error = await caught(call());
        expect(error).toBeInstanceOf(GbpError);
        expect((error as GbpError).code).toBe(code);
        expect((error as GbpError).message).toBe(code);
      }
    }
  });

  it("an AbortSignal timeout gives timeout; a rejected fetch gives network", async () => {
    const timeout = await caught(
      getReview("tok", REVIEW_NAME, fetchRejecting(new DOMException("The operation was aborted due to timeout", "TimeoutError"))),
    );
    expect((timeout as GbpError).code).toBe("timeout");

    const aborted = await caught(
      putReply("tok", REVIEW_NAME, "hi", fetchRejecting(new DOMException("This operation was aborted", "AbortError"))),
    );
    expect((aborted as GbpError).code).toBe("timeout");

    const network = await caught(deleteReply("tok", REVIEW_NAME, fetchRejecting(new TypeError("fetch failed"))));
    expect(network).toBeInstanceOf(GbpError);
    expect((network as GbpError).code).toBe("network");

    const locationTimeout = await caught(
      findLocationForPlace("tok", "p", fetchRejecting(new DOMException("timed out", "TimeoutError"))),
    );
    expect((locationTimeout as GbpError).code).toBe("timeout");
  });

  it("a 2xx with an unparseable body is a provider_error", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return {
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token SECRET_BODY");
        },
      } as unknown as Response;
    });
    const error = await caught(getReview("tok_SECRET", REVIEW_NAME, fetchImpl));
    expect((error as GbpError).code).toBe("provider_error");
    expect((error as GbpError).cause).toBeUndefined();
  });

  it("every call carries an AbortSignal", async () => {
    const fetchImpl = fetchReturning([{ ok: true, json: {} }]);
    await getReview("tok", REVIEW_NAME, fetchImpl);
    await putReply("tok", REVIEW_NAME, "hi", fetchImpl);
    await deleteReply("tok", REVIEW_NAME, fetchImpl);
    await listUnrepliedReviews("tok", LOCATION, fetchImpl);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });
});

describe("getReview, putReply and deleteReply", () => {
  it("getReview reads the reply comment and update time, null when there is no reply", async () => {
    const replied = fetchReturning([
      { ok: true, json: { ...review("r1"), reviewReply: { comment: "Thank you", updateTime: "2026-10-03T00:00:00Z" } } },
    ]);
    await expect(getReview("tok", REVIEW_NAME, replied)).resolves.toEqual({
      name: REVIEW_NAME,
      replyComment: "Thank you",
      replyUpdateTime: "2026-10-03T00:00:00Z",
    });
    const [url, init] = replied.mock.calls[0]!;
    expect(url).toBe(`${REVIEWS_BASE}/${REVIEW_NAME}`);
    expect((init?.method ?? "GET").toUpperCase()).toBe("GET");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");

    const bare = fetchReturning([{ ok: true, json: review("r1") }]);
    await expect(getReview("tok", REVIEW_NAME, bare)).resolves.toEqual({
      name: REVIEW_NAME,
      replyComment: null,
      replyUpdateTime: null,
    });
  });

  it("putReply sends PUT with {comment} and a bearer header; deleteReply treats 404 as success", async () => {
    const put = fetchReturning([{ ok: true, json: { comment: "Thanks", updateTime: "2026-10-03T00:00:00Z" } }]);
    await expect(putReply("tok", REVIEW_NAME, "Thanks for visiting", put)).resolves.toBeUndefined();
    const [putUrl, putInit] = put.mock.calls[0]!;
    expect(putUrl).toBe(`${REVIEWS_BASE}/${REVIEW_NAME}/reply`);
    expect(putInit?.method).toBe("PUT");
    const putHeaders = putInit?.headers as Record<string, string>;
    expect(putHeaders.Authorization).toBe("Bearer tok");
    expect(putHeaders["Content-Type"]).toBe("application/json");
    expect(JSON.parse(putInit?.body as string)).toEqual({ comment: "Thanks for visiting" });

    const del = fetchReturning([{ ok: true, json: {} }]);
    await expect(deleteReply("tok", REVIEW_NAME, del)).resolves.toBeUndefined();
    const [delUrl, delInit] = del.mock.calls[0]!;
    expect(delUrl).toBe(`${REVIEWS_BASE}/${REVIEW_NAME}/reply`);
    expect(delInit?.method).toBe("DELETE");
    expect((delInit?.headers as Record<string, string>).Authorization).toBe("Bearer tok");

    await expect(deleteReply("tok", REVIEW_NAME, fetchReturning([{ ok: false, status: 404 }]))).resolves.toBeUndefined();
    const forbidden = await caught(deleteReply("tok", REVIEW_NAME, fetchReturning([{ ok: false, status: 403 }])));
    expect((forbidden as GbpError).code).toBe("forbidden");
  });
});

describe("error hygiene", () => {
  it("thrown errors never contain the access token or the response body", async () => {
    const body = { error: { message: "SECRET_BODY tok_SECRET", details: ["SECRET_BODY"] } };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

    const errors: unknown[] = [];
    for (const status of [400, 401, 403, 404, 429, 500]) {
      const fetchImpl = () => fetchReturning([{ ok: false, status, json: body }]);
      errors.push(await caught(getReview("tok_SECRET", REVIEW_NAME, fetchImpl())));
      errors.push(await caught(listUnrepliedReviews("tok_SECRET", LOCATION, fetchImpl())));
      errors.push(await caught(putReply("tok_SECRET", REVIEW_NAME, "reply SECRET_BODY", fetchImpl())));
      errors.push(await caught(findLocationForPlace("tok_SECRET", "place", fetchImpl())));
      if (status !== 404) errors.push(await caught(deleteReply("tok_SECRET", REVIEW_NAME, fetchImpl())));
    }
    errors.push(await caught(getReview("tok_SECRET", REVIEW_NAME, fetchRejecting(new TypeError("SECRET_BODY tok_SECRET")))));

    for (const error of errors) {
      expect(error).toBeInstanceOf(GbpError);
      const gbp = error as GbpError;
      const rendered = [gbp.message, String(gbp), JSON.stringify(gbp), gbp.stack ?? ""].join("\n");
      expect(rendered).not.toContain("tok_SECRET");
      expect(rendered).not.toContain("SECRET_BODY");
      expect(gbp.message).toBe(gbp.code);
      expect(gbp.cause).toBeUndefined();
      expect(Object.keys(gbp)).toEqual(["code"]);
    }
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
    consoleError.mockRestore();
    consoleWarn.mockRestore();
    consoleLog.mockRestore();
  });
});

describe("sameReply", () => {
  it("sameReply: CRLF vs LF, trailing spaces and NFD vs NFC are equal; one changed character is not", () => {
    expect(sameReply("Thanks\r\nSee you", "Thanks\nSee you")).toBe(true);
    expect(sameReply("Thanks for visiting  \n", "Thanks for visiting")).toBe(true);
    expect(sameReply("  Thanks", "Thanks")).toBe(true);
    expect(sameReply("Café", "Café")).toBe(true);
    expect(sameReply("多謝光臨", "多謝光臨")).toBe(true);
    expect(sameReply("Thanks for visiting", "Thanks for visitinG")).toBe(false);
    expect(sameReply("多謝光臨", "多謝光顧")).toBe(false);
  });
});

describe("reviewNameIsUnder", () => {
  it("reviewNameIsUnder rejects another location, a path with extra segments and an encoded slash", () => {
    expect(reviewNameIsUnder("accounts/1/locations/2/reviews/AbC_-9", LOCATION)).toBe(true);
    expect(reviewNameIsUnder("accounts/1/locations/3/reviews/abc", LOCATION)).toBe(false);
    expect(reviewNameIsUnder("accounts/9/locations/2/reviews/abc", LOCATION)).toBe(false);
    expect(reviewNameIsUnder("accounts/1/locations/2/reviews/abc/reply", LOCATION)).toBe(false);
    expect(reviewNameIsUnder("accounts/1/locations/2/reviews/abc%2Freply", LOCATION)).toBe(false);
    expect(reviewNameIsUnder("accounts/1/locations/2/reviews/", LOCATION)).toBe(false);
    expect(reviewNameIsUnder("accounts/1/locations/22/reviews/abc", LOCATION)).toBe(false);
    expect(reviewNameIsUnder("accounts/1/locations/2/reviews/../x", LOCATION)).toBe(false);
    expect(reviewNameIsUnder("x/accounts/1/locations/2/reviews/abc", LOCATION)).toBe(false);
  });
});
