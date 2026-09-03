import { describe, expect, it, vi } from "vitest";
import { listManagedPlaceIds } from "./google-business-profile";

function fetchReturning(responses: Array<{ ok: boolean; status?: number; json?: unknown }>) {
  let call = 0;
  // Typed with fetch's own parameters (even though the body ignores them) so
  // that `.mock.calls` below is typed as `[url, init]` instead of the `[]`
  // tuple TS would otherwise infer from a zero-arg arrow function -- without
  // this, inspecting what was actually passed to fetch is a type error, which
  // is exactly the inspection the header/readMask tests below rely on.
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

describe("listManagedPlaceIds", () => {
  it("lists every place_id across every account and location the token can see", async () => {
    const fetchImpl = fetchReturning([
      { ok: true, json: { accounts: [{ name: "accounts/111" }, { name: "accounts/222" }] } },
      { ok: true, json: { locations: [{ name: "locations/aaa", metadata: { placeId: "place-a" } }] } },
      { ok: true, json: { locations: [{ name: "locations/bbb", metadata: { placeId: "place-b" } }] } },
    ]);

    const result = await listManagedPlaceIds("access-token-1", fetchImpl);

    expect(result).toEqual([
      { placeId: "place-a", locationName: "locations/aaa" },
      { placeId: "place-b", locationName: "locations/bbb" },
    ]);
  });

  it("skips a location with no placeId in its metadata rather than throwing", async () => {
    // Google's schema documents metadata.placeId as present, but this repo's
    // own convention (the L6 Day-0 spike, the IG auto-match spec) is to verify
    // every such assumption against a real response before relying on it, and
    // to degrade rather than crash if a field is genuinely absent on some
    // location.
    const fetchImpl = fetchReturning([
      { ok: true, json: { accounts: [{ name: "accounts/111" }] } },
      { ok: true, json: { locations: [{ name: "locations/aaa", metadata: {} }] } },
    ]);

    await expect(listManagedPlaceIds("access-token-1", fetchImpl)).resolves.toEqual([]);
  });

  it("skips a location with a placeId but no name rather than emitting a malformed record", async () => {
    // Mirrors the placeId-missing case above but for the other half of the
    // `!placeId || !location.name` guard -- a location's own resource name
    // (locations/xyz) can theoretically be absent even when its metadata is
    // populated, and dropping just the `!location.name` half of that OR would
    // otherwise slip a `{ placeId, locationName: undefined }` record past
    // every other test in this file, none of which exercises a present
    // placeId paired with a missing name.
    const fetchImpl = fetchReturning([
      { ok: true, json: { accounts: [{ name: "accounts/111" }] } },
      { ok: true, json: { locations: [{ metadata: { placeId: "place-a" } }] } },
    ]);

    await expect(listManagedPlaceIds("access-token-1", fetchImpl)).resolves.toEqual([]);
  });

  it("returns an empty list when the account manages nothing", async () => {
    const fetchImpl = fetchReturning([{ ok: true, json: { accounts: [] } }]);
    await expect(listManagedPlaceIds("access-token-1", fetchImpl)).resolves.toEqual([]);
  });

  it("throws on an account-listing failure, including the 403 expected until GCP access is granted", async () => {
    const fetchImpl = fetchReturning([{ ok: false, status: 403 }]);
    await expect(listManagedPlaceIds("access-token-1", fetchImpl)).rejects.toThrow(
      "business_profile_accounts_failed",
    );
  });

  it("throws on a location-listing failure for one account rather than silently dropping it", async () => {
    const fetchImpl = fetchReturning([
      { ok: true, json: { accounts: [{ name: "accounts/111" }] } },
      { ok: false, status: 500 },
    ]);
    await expect(listManagedPlaceIds("access-token-1", fetchImpl)).rejects.toThrow(
      "business_profile_locations_failed",
    );
  });

  it("never puts the access token in an error message", async () => {
    const fetchImpl = fetchReturning([{ ok: false, status: 401 }]);
    await expect(listManagedPlaceIds("secret-token-value", fetchImpl)).rejects.not.toThrow(
      /secret-token-value/,
    );
  });

  it("throws an error whose message is exactly the static failure code, never the response body", async () => {
    // Strengthens the test above: that one only proves the token specifically
    // is absent from the message, which a static failure-code string would
    // trivially satisfy regardless of whether the implementation ever
    // touched the token. This asserts the actual caught error's message,
    // which would also catch a regression that echoed the response body
    // (`await response.json()`) or the request URL into the thrown error --
    // neither of which contains the literal token string either, so neither
    // would be caught by a token-only substring check.
    //
    // It also rules out three further leak channels a message-content check
    // alone cannot see, because none of them touch `.message` at all:
    //   - `new Error(failureCode, { cause: await response.json() })`
    //   - `Object.assign(new Error(failureCode), { token: accessToken })`
    //   - `console.error("gbp failure", accessToken, await response.json())`
    // An error's `cause` and any own-enumerable properties survive
    // `JSON.stringify`/structured-clone the same way `message` does once the
    // error reaches a caller that serializes it or forwards it to a log
    // drain, so this is not a hypothetical: `cause` and extra own keys are as
    // leak-capable as `message` is once the error leaves this module.
    const fetchImpl = fetchReturning([
      { ok: false, status: 401, json: { error: { message: "invalid token: secret-token-value" } } },
    ]);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    let caught: unknown;
    try {
      await listManagedPlaceIds("secret-token-value", fetchImpl);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("business_profile_accounts_failed");
    expect((caught as Error).cause).toBeUndefined();
    expect(Object.keys(caught as object)).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("sends the access token as a bearer header on every request, not just the first", async () => {
    // fetchReturning's mock ignores its call arguments entirely, so none of
    // the tests above notice if the Authorization header were dropped from
    // the request -- the call-sequence and returned JSON would be identical
    // either way. This inspects the actual call arguments instead.
    const fetchImpl = fetchReturning([
      { ok: true, json: { accounts: [{ name: "accounts/111" }] } },
      { ok: true, json: { locations: [] } },
    ]);

    await listManagedPlaceIds("token-xyz", fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchImpl.mock.calls) {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer token-xyz");
      // A request to an API holding a live business.manage-scoped token
      // must never hang indefinitely -- `AbortSignal.timeout(10_000)` is the
      // only thing enforcing that, and nothing above notices if it were
      // deleted or shortened to an unusably small value, since the mock
      // never actually waits on the signal.
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("requests locations scoped to the account name with the metadata read mask", async () => {
    // Same blind spot as the header test: nothing above checks which URL was
    // actually requested for the per-account locations call, so a swapped or
    // missing readMask query param would pass every test above unnoticed.
    const fetchImpl = fetchReturning([
      { ok: true, json: { accounts: [{ name: "accounts/111" }] } },
      { ok: true, json: { locations: [] } },
    ]);

    await listManagedPlaceIds("token", fetchImpl);

    const [locationsUrl] = fetchImpl.mock.calls[1]!;
    const url = new URL(locationsUrl as string);
    expect(url.pathname).toContain("accounts/111/locations");
    expect(url.searchParams.get("readMask")).toBe("name,metadata");
  });

  it("follows nextPageToken to find a matching location on the second page", async () => {
    // The bug this guards: listManagedPlaceIds used to read only the first
    // page of each paginated Google API. A merchant managing several
    // locations whose matching one lands on page 2 would be told
    // place_not_managed -- indistinguishable from someone who genuinely
    // doesn't manage the business.
    const fetchImpl = fetchReturning([
      { ok: true, json: { accounts: [{ name: "accounts/111" }] } },
      {
        ok: true,
        json: {
          locations: [{ name: "locations/aaa", metadata: { placeId: "place-a" } }],
          nextPageToken: "page-2",
        },
      },
      { ok: true, json: { locations: [{ name: "locations/bbb", metadata: { placeId: "place-b" } }] } },
    ]);

    const result = await listManagedPlaceIds("access-token-1", fetchImpl);

    expect(result).toEqual([
      { placeId: "place-a", locationName: "locations/aaa" },
      { placeId: "place-b", locationName: "locations/bbb" },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const secondPageUrl = new URL(fetchImpl.mock.calls[2]![0] as string);
    expect(secondPageUrl.searchParams.get("pageToken")).toBe("page-2");
  });

  it("also follows nextPageToken across the accounts listing itself, not just each account's locations", async () => {
    const fetchImpl = fetchReturning([
      { ok: true, json: { accounts: [{ name: "accounts/111" }], nextPageToken: "accounts-page-2" } },
      { ok: true, json: { accounts: [{ name: "accounts/222" }] } },
      { ok: true, json: { locations: [{ name: "locations/aaa", metadata: { placeId: "place-a" } }] } },
      { ok: true, json: { locations: [{ name: "locations/bbb", metadata: { placeId: "place-b" } }] } },
    ]);

    const result = await listManagedPlaceIds("access-token-1", fetchImpl);

    expect(result).toEqual([
      { placeId: "place-a", locationName: "locations/aaa" },
      { placeId: "place-b", locationName: "locations/bbb" },
    ]);
    const secondAccountsPageUrl = new URL(fetchImpl.mock.calls[1]![0] as string);
    expect(secondAccountsPageUrl.searchParams.get("pageToken")).toBe("accounts-page-2");
  });

  it("stops after a hard cap of pages rather than looping forever on a misbehaving nextPageToken", async () => {
    const fetchImpl = fetchReturning([
      { ok: true, json: { accounts: [{ name: "accounts/111" }] } },
      { ok: true, json: { locations: [], nextPageToken: "again" } },
    ]);

    await listManagedPlaceIds("access-token-1", fetchImpl);

    // One accounts call plus exactly the 10-page cap on the one account's
    // locations listing -- never unbounded, which is what would hang an
    // interactive OAuth callback against a misbehaving API.
    expect(fetchImpl).toHaveBeenCalledTimes(11);
  });

  it("skips an account with no name rather than requesting .../v1/undefined/locations", async () => {
    // Mirrors the location-level `!location.name` guard, but for its account-
    // level sibling `if (!account.name) continue`. Every other test's single
    // account always has a name, so nothing above notices if that guard were
    // deleted -- the loop would then build a locations URL out of `undefined`
    // for the nameless account, with nothing catching it.
    const fetchImpl = fetchReturning([
      { ok: true, json: { accounts: [{}, { name: "accounts/111" }] } },
      { ok: true, json: { locations: [] } },
    ]);

    const result = await listManagedPlaceIds("token", fetchImpl);

    expect(result).toEqual([]);
    // One accounts call plus exactly one locations call (for accounts/111) --
    // not two, which is what a missing guard would produce.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
