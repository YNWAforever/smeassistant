import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repositoryConsume = vi.hoisted(() => vi.fn());
vi.mock("@/lib/repositories/workflow", () => ({
  workflowRepository: () => ({ consumeRateLimit: repositoryConsume }),
}));

import { rateLimitBucketKey, type RateLimitClient } from "@/lib/security/rate-limit";
import { consumeInstagramPublishLimits } from "./instagram-limits";

const WORKSPACE = "00000000-0000-4000-8000-0000000000aa";
const DELIVERY = "00000000-0000-4000-8000-0000000000bb";

function allowing() {
  return vi.fn<RateLimitClient["rpc"]>(async () => ({
    data: [{ allowed: true, retry_after_seconds: 0 }],
    error: null,
  }));
}

describe("consumeInstagramPublishLimits", () => {
  beforeEach(() => {
    process.env.RATE_LIMIT_SECRET = "test-secret-instagram-publish";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("publish consumes instagram_publish then instagram_publish_global with fingerprint-free keys", async () => {
    const rpc = allowing();
    await expect(consumeInstagramPublishLimits("publish", { workspaceId: WORKSPACE }, { rpc })).resolves.toEqual({ allowed: true });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual([
      "consume_rate_limit",
      { p_bucket_key: rateLimitBucketKey("instagram_publish", WORKSPACE), p_limit: 10, p_window_seconds: 86400 },
    ]);
    expect(rpc.mock.calls[1]).toEqual([
      "consume_rate_limit",
      { p_bucket_key: rateLimitBucketKey("instagram_publish_global", "all"), p_limit: 100, p_window_seconds: 86400 },
    ]);
    expect(String(rpc.mock.calls[0]?.[1]?.p_bucket_key)).toMatch(/^instagram_publish:[0-9a-f]{64}$/);
    expect(String(rpc.mock.calls[1]?.[1]?.p_bucket_key)).toMatch(/^instagram_publish_global:[0-9a-f]{64}$/);
  });

  it("a refused workspace bucket does not consume the global bucket", async () => {
    const rpc = vi.fn(async () => ({ data: [{ allowed: false, retry_after_seconds: 3600 }], error: null }));
    await expect(consumeInstagramPublishLimits("publish", { workspaceId: WORKSPACE }, { rpc })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 3600,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("reconcile consumes instagram_reconcile keyed by the delivery id", async () => {
    const rpc = allowing();
    await expect(
      consumeInstagramPublishLimits("reconcile", { workspaceId: WORKSPACE, deliveryId: DELIVERY }, { rpc }),
    ).resolves.toEqual({ allowed: true });
    expect(rpc.mock.calls[0]).toEqual([
      "consume_rate_limit",
      { p_bucket_key: rateLimitBucketKey("instagram_reconcile", DELIVERY), p_limit: 30, p_window_seconds: 86400 },
    ]);
  });

  it("fails closed when the limiter throws", async () => {
    const rpc = vi.fn(async () => {
      throw new Error("db down");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(consumeInstagramPublishLimits("publish", { workspaceId: WORKSPACE }, { rpc })).resolves.toEqual({
      allowed: false,
      unavailable: true,
    });
  });
});
