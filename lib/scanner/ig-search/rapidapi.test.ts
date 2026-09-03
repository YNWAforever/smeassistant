import { describe, expect, it, vi } from "vitest";
import { buildRapidApiSearchRequest, normalizeRapidApiSearchBody, searchInstagramRapidApi } from "./rapidapi";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const env = { RAPIDAPI_INSTAGRAM_KEY: "test-key" };

describe("buildRapidApiSearchRequest", () => {
  it("targets the host the scanner already uses, with the key in a header", () => {
    const request = buildRapidApiSearchRequest("金萬餐廳", "test-key", "search_ig.php");
    expect(request.url).toBe(
      "https://instagram-scraper-stable-api.p.rapidapi.com/search_ig.php?search_query=%E9%87%91%E8%90%AC%E9%A4%90%E5%BB%B3",
    );
    const headers = request.init.headers as Record<string, string>;
    expect(headers["x-rapidapi-host"]).toBe("instagram-scraper-stable-api.p.rapidapi.com");
    expect(headers["x-rapidapi-key"]).toBe("test-key");
  });

  it("rejects an endpoint path that is not a bare .php file", () => {
    expect(() => buildRapidApiSearchRequest("x", "k", "../../etc/passwd")).toThrow();
    expect(() => buildRapidApiSearchRequest("x", "k", "https://evil.example/x.php")).toThrow();
  });
});

describe("normalizeRapidApiSearchBody", () => {
  it("reads users from any of the shapes this endpoint family returns", () => {
    for (const body of [
      { users: [{ username: "kamman.hk", full_name: "金萬餐廳" }] },
      { data: { users: [{ user: { username: "kamman.hk", full_name: "金萬餐廳" } }] } },
      { results: [{ username: "kamman.hk", full_name: "金萬餐廳" }] },
    ]) {
      const candidates = normalizeRapidApiSearchBody(body);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({
        handle: "kamman.hk",
        displayName: "金萬餐廳",
        provenance: "picker_confirmed",
      });
    }
  });

  it("returns nothing rather than guessing when the shape is unrecognized", () => {
    expect(normalizeRapidApiSearchBody({ unexpected: "shape" })).toEqual([]);
    expect(normalizeRapidApiSearchBody(null)).toEqual([]);
    expect(normalizeRapidApiSearchBody("nope")).toEqual([]);
  });

  it("drops entries whose username fails the strict handle validator", () => {
    expect(normalizeRapidApiSearchBody({ users: [{ username: "not a handle" }, { username: "explore" }, { username: "" }] }))
      .toEqual([]);
  });

  it("dedupes repeated usernames and caps the list", () => {
    const users = [{ username: "a" }, { username: "a" }, ...Array.from({ length: 12 }, (_u, i) => ({ username: `s${i}` }))];
    expect(normalizeRapidApiSearchBody({ users })).toHaveLength(8);
  });
});

describe("searchInstagramRapidApi", () => {
  it("is UNSUPPORTED, not an error, when no key is configured", async () => {
    const fetcher = vi.fn();
    const result = await searchInstagramRapidApi("金萬餐廳", { env: {}, fetcher: fetcher as unknown as typeof fetch });
    expect(result.outcome).toBe("UNSUPPORTED");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("is UNSUPPORTED when the endpoint does not exist on this plan", async () => {
    const result = await searchInstagramRapidApi("金萬餐廳", {
      env,
      fetcher: (async () => jsonResponse({ message: "Endpoint not found" }, 404)) as unknown as typeof fetch,
    });
    expect(result.outcome).toBe("UNSUPPORTED");
  });

  it("is UNSUPPORTED when the subscription does not include the endpoint", async () => {
    const result = await searchInstagramRapidApi("金萬餐廳", {
      env,
      fetcher: (async () => jsonResponse({ message: "You are not subscribed to this API." }, 403)) as unknown as typeof fetch,
    });
    expect(result.outcome).toBe("UNSUPPORTED");
  });

  it("reports a real auth failure rather than hiding it as UNSUPPORTED", async () => {
    const result = await searchInstagramRapidApi("金萬餐廳", {
      env,
      fetcher: (async () => jsonResponse({ message: "Invalid API key" }, 401)) as unknown as typeof fetch,
    });
    expect(result.outcome).toBe("PROVIDER_AUTH_ERROR");
  });

  it("reports quota exhaustion so the chain can surface it", async () => {
    const result = await searchInstagramRapidApi("金萬餐廳", {
      env,
      fetcher: (async () => jsonResponse({ message: "Too many requests" }, 429)) as unknown as typeof fetch,
    });
    expect(result.outcome).toBe("PROVIDER_QUOTA_ERROR");
  });

  it("returns candidates on success", async () => {
    const result = await searchInstagramRapidApi("金萬餐廳", {
      env,
      fetcher: (async () => jsonResponse({ users: [{ username: "kamman.hk", full_name: "金萬餐廳" }] })) as unknown as typeof fetch,
    });
    expect(result.outcome).toBe("SUCCESS");
    expect(result.candidates.map((candidate) => candidate.handle)).toEqual(["kamman.hk"]);
  });

  it("returns NO_RESULTS when the call succeeds but yields no usable handle", async () => {
    const result = await searchInstagramRapidApi("金萬餐廳", {
      env,
      fetcher: (async () => jsonResponse({ users: [] })) as unknown as typeof fetch,
    });
    expect(result.outcome).toBe("NO_RESULTS");
  });

  it("maps an aborted or timed-out fetch to TIMEOUT", async () => {
    const result = await searchInstagramRapidApi("金萬餐廳", {
      env,
      fetcher: (async () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }) as unknown as typeof fetch,
    });
    expect(result.outcome).toBe("TIMEOUT");
  });

  it("honours an operator-corrected endpoint path", async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ users: [] }));
    await searchInstagramRapidApi("金萬餐廳", {
      env: { ...env, RAPIDAPI_INSTAGRAM_SEARCH_PATH: "ig_search_users.php" },
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(fetcher.mock.calls[0]![0]).toContain("/ig_search_users.php?");
  });

  it("treats a malformed configured path as UNSUPPORTED instead of throwing", async () => {
    const result = await searchInstagramRapidApi("金萬餐廳", {
      env: { ...env, RAPIDAPI_INSTAGRAM_SEARCH_PATH: "https://evil.example/x" },
      fetcher: (async () => jsonResponse({})) as unknown as typeof fetch,
    });
    expect(result.outcome).toBe("UNSUPPORTED");
  });
});
