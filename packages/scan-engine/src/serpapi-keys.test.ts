import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSerpApiQuotaExhausted,
  markSerpApiKeyExhausted,
  resetSerpApiKeyState,
  resolveSerpApiKey,
  resolveSerpApiKeys,
  withSerpApiKeyFallback,
} from "./serpapi-keys";

beforeEach(() => resetSerpApiKeyState());

describe("resolveSerpApiKeys", () => {
  it("treats SERPAPI_API_KEY and SERPAPI_KEY as names for the same primary key", () => {
    expect(resolveSerpApiKeys({ SERPAPI_API_KEY: "new" })).toEqual(["new"]);
    expect(resolveSerpApiKeys({ SERPAPI_KEY: "legacy" })).toEqual(["legacy"]);
    // Both set: the modern name wins and the legacy one is NOT a second key.
    expect(resolveSerpApiKeys({ SERPAPI_API_KEY: "new", SERPAPI_KEY: "legacy" })).toEqual(["new"]);
  });

  it("appends the fallback as a genuinely separate key", () => {
    expect(resolveSerpApiKeys({
      SERPAPI_API_KEY: "primary",
      SERPAPI_API_KEY_FALLBACK: "spare",
    })).toEqual(["primary", "spare"]);
    expect(resolveSerpApiKeys({
      SERPAPI_KEY: "primary",
      SERPAPI_KEY_FALLBACK: "spare",
    })).toEqual(["primary", "spare"]);
  });

  it("deduplicates so an identical fallback does not burn a second search", () => {
    expect(resolveSerpApiKeys({
      SERPAPI_API_KEY: "same",
      SERPAPI_API_KEY_FALLBACK: "same",
    })).toEqual(["same"]);
  });

  it("ignores blank and whitespace-only values", () => {
    expect(resolveSerpApiKeys({ SERPAPI_API_KEY: "   ", SERPAPI_API_KEY_FALLBACK: "" })).toEqual([]);
    expect(resolveSerpApiKeys({})).toEqual([]);
    expect(resolveSerpApiKey({})).toBeNull();
    expect(resolveSerpApiKey({ SERPAPI_API_KEY: " padded " })).toBe("padded");
  });
});

describe("isSerpApiQuotaExhausted", () => {
  it("detects an explicit 429", () => {
    expect(isSerpApiQuotaExhausted(429, null)).toBe(true);
  });

  it("detects quota reported in the body on a non-429 status", () => {
    // The reason this lives in one place: SerpApi returns an `error` string even
    // on statuses a caller would otherwise treat as success.
    expect(isSerpApiQuotaExhausted(200, { error: "You've run out of searches." })).toBe(true);
    expect(isSerpApiQuotaExhausted(401, { error: "You have exceeded your searches per month." })).toBe(true);
    expect(isSerpApiQuotaExhausted(403, { error: "Your plan monthly limit was reached." })).toBe(true);
  });

  it("does NOT treat auth or query errors as quota", () => {
    expect(isSerpApiQuotaExhausted(401, { error: "Invalid API key." })).toBe(false);
    expect(isSerpApiQuotaExhausted(400, { error: "Missing query `q` parameter." })).toBe(false);
    expect(isSerpApiQuotaExhausted(500, { error: "Internal error" })).toBe(false);
    expect(isSerpApiQuotaExhausted(200, {})).toBe(false);
    expect(isSerpApiQuotaExhausted(200, null)).toBe(false);
  });
});

describe("withSerpApiKeyFallback", () => {
  it("returns null when no key is configured", async () => {
    const attempt = vi.fn();
    expect(await withSerpApiKeyFallback([], attempt)).toBeNull();
    expect(attempt).not.toHaveBeenCalled();
  });

  it("uses the primary key and does not touch the fallback on success", async () => {
    const attempt = vi.fn(async (key: string) => ({ result: key, quotaExhausted: false }));
    expect(await withSerpApiKeyFallback(["primary", "spare"], attempt)).toBe("primary");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("fails over to the fallback when the primary is out of quota", async () => {
    const attempt = vi.fn(async (key: string) => ({
      result: key,
      quotaExhausted: key === "primary",
    }));
    expect(await withSerpApiKeyFallback(["primary", "spare"], attempt)).toBe("spare");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("does NOT fail over on a non-quota failure", async () => {
    // An auth error or bad query would fail identically on the second key, and
    // retrying would spend a search to learn nothing.
    const attempt = vi.fn(async (key: string) => ({ result: `failed:${key}`, quotaExhausted: false }));
    expect(await withSerpApiKeyFallback(["primary", "spare"], attempt)).toBe("failed:primary");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("skips a key already known to be exhausted without spending a request", async () => {
    markSerpApiKeyExhausted("primary");
    const attempt = vi.fn(async (key: string) => ({ result: key, quotaExhausted: false }));
    expect(await withSerpApiKeyFallback(["primary", "spare"], attempt)).toBe("spare");
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledWith("spare");
  });

  it("remembers exhaustion across calls so later scans skip the dead key", async () => {
    const attempt = vi.fn(async (key: string) => ({
      result: key,
      quotaExhausted: key === "primary",
    }));
    await withSerpApiKeyFallback(["primary", "spare"], attempt);
    attempt.mockClear();
    await withSerpApiKeyFallback(["primary", "spare"], attempt);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledWith("spare");
  });

  it("re-probes an exhausted key once the TTL lapses, since quota resets", async () => {
    const attempt = vi.fn(async (key: string) => ({ result: key, quotaExhausted: false }));
    markSerpApiKeyExhausted("primary", 0);
    // 10 minutes and change later.
    const later = () => 10 * 60 * 1000 + 1;
    expect(await withSerpApiKeyFallback(["primary", "spare"], attempt, later)).toBe("primary");
    expect(attempt).toHaveBeenCalledWith("primary");
  });

  it("re-probes rather than giving up when every key is marked exhausted", async () => {
    markSerpApiKeyExhausted("primary");
    markSerpApiKeyExhausted("spare");
    const attempt = vi.fn(async (key: string) => ({ result: key, quotaExhausted: false }));
    expect(await withSerpApiKeyFallback(["primary", "spare"], attempt)).toBe("primary");
  });

  it("returns the last real provider result when every key is genuinely exhausted", async () => {
    // Callers already know how to classify a quota response; handing back a
    // synthetic error instead would bypass their reporting.
    const attempt = vi.fn(async (key: string) => ({ result: `quota:${key}`, quotaExhausted: true }));
    expect(await withSerpApiKeyFallback(["primary", "spare"], attempt)).toBe("quota:spare");
    expect(attempt).toHaveBeenCalledTimes(2);
  });
});
