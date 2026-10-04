import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repositoryConsume = vi.hoisted(() => vi.fn());
vi.mock("@/lib/repositories/workflow", () => ({
  workflowRepository: () => ({ consumeRateLimit: repositoryConsume }),
}));

import { rateLimitBucketKey, type RateLimitClient } from "@/lib/security/rate-limit";
import { consumePublishLimits } from "./limits";

const WORKSPACE = "00000000-0000-4000-8000-0000000000aa";
const DELIVERY = "00000000-0000-4000-8000-0000000000bb";

function allowing() {
  return vi.fn<RateLimitClient["rpc"]>(async () => ({
    data: [{ allowed: true, retry_after_seconds: 0 }],
    error: null,
  }));
}

describe("consumePublishLimits", () => {
  beforeEach(() => {
    process.env.RATE_LIMIT_SECRET = "test-secret-publish";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("publish consumes gbp_publish then gbp_publish_global with keys built from rateLimitBucketKey and no fingerprint", async () => {
    const rpc = allowing();
    await expect(consumePublishLimits("publish", { workspaceId: WORKSPACE }, { rpc }))
      .resolves.toEqual({ allowed: true });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(["consume_rate_limit", {
      p_bucket_key: rateLimitBucketKey("gbp_publish", WORKSPACE),
      p_limit: 20,
      p_window_seconds: 86400,
    }]);
    expect(rpc.mock.calls[1]).toEqual(["consume_rate_limit", {
      p_bucket_key: rateLimitBucketKey("gbp_publish_global", "all"),
      p_limit: 200,
      p_window_seconds: 86400,
    }]);
    // Exactly one HMAC segment per key: the id, with no request fingerprint appended.
    expect(String(rpc.mock.calls[0]?.[1]?.p_bucket_key)).toMatch(/^gbp_publish:[0-9a-f]{64}$/);
    expect(String(rpc.mock.calls[1]?.[1]?.p_bucket_key)).toMatch(/^gbp_publish_global:[0-9a-f]{64}$/);
  });

  it("a refused workspace bucket does not consume the global bucket", async () => {
    const rpc = vi.fn(async () => ({ data: [{ allowed: false, retry_after_seconds: 3600 }], error: null }));
    await expect(consumePublishLimits("publish", { workspaceId: WORKSPACE }, { rpc }))
      .resolves.toEqual({ allowed: false, retryAfterSeconds: 3600 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("a refused global bucket refuses the publish", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null })
      .mockResolvedValueOnce({ data: [{ allowed: false, retry_after_seconds: 120 }], error: null });
    await expect(consumePublishLimits("publish", { workspaceId: WORKSPACE }, { rpc }))
      .resolves.toEqual({ allowed: false, retryAfterSeconds: 120 });
  });

  it("delete consumes only gbp_publish; targets consumes gbp_targets; reconcile consumes gbp_reconcile keyed by delivery", async () => {
    const del = allowing();
    await expect(consumePublishLimits("delete", { workspaceId: WORKSPACE }, { rpc: del }))
      .resolves.toEqual({ allowed: true });
    expect(del.mock.calls.map((call) => call[1])).toEqual([{
      p_bucket_key: rateLimitBucketKey("gbp_publish", WORKSPACE), p_limit: 20, p_window_seconds: 86400,
    }]);

    const targets = allowing();
    await consumePublishLimits("targets", { workspaceId: WORKSPACE }, { rpc: targets });
    expect(targets.mock.calls.map((call) => call[1])).toEqual([{
      p_bucket_key: rateLimitBucketKey("gbp_targets", WORKSPACE), p_limit: 60, p_window_seconds: 3600,
    }]);

    const reconcile = allowing();
    await consumePublishLimits("reconcile", { workspaceId: WORKSPACE, deliveryId: DELIVERY }, { rpc: reconcile });
    expect(reconcile.mock.calls.map((call) => call[1])).toEqual([{
      p_bucket_key: rateLimitBucketKey("gbp_reconcile", DELIVERY), p_limit: 30, p_window_seconds: 86400,
    }]);
  });

  it("limiter error returns unavailable", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn(async () => ({ data: null, error: { message: "connection refused to db.internal" } }));
    await expect(consumePublishLimits("publish", { workspaceId: WORKSPACE }, { rpc }))
      .resolves.toEqual({ allowed: false, unavailable: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.slice(1)).toEqual([{ category: "gbp_publish_limiter_unavailable" }]);
    expect(JSON.stringify(log.mock.calls)).not.toContain("db.internal");
    expect(JSON.stringify(log.mock.calls)).not.toContain(WORKSPACE);
  });

  it("defaults to the workflow repository's consumeRateLimit adapter", async () => {
    repositoryConsume.mockReset();
    repositoryConsume.mockResolvedValue({ allowed: true, retry_after_seconds: 0 });
    await expect(consumePublishLimits("targets", { workspaceId: WORKSPACE }))
      .resolves.toEqual({ allowed: true });
    expect(repositoryConsume).toHaveBeenCalledWith(rateLimitBucketKey("gbp_targets", WORKSPACE), 60, 3600);
  });

  it("a throwing adapter, or a reconcile without a delivery id, fails closed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn(async () => {
      throw new Error("socket hang up");
    });
    await expect(consumePublishLimits("targets", { workspaceId: WORKSPACE }, { rpc }))
      .resolves.toEqual({ allowed: false, unavailable: true });

    const unused = allowing();
    await expect(consumePublishLimits("reconcile", { workspaceId: WORKSPACE }, { rpc: unused }))
      .resolves.toEqual({ allowed: false, unavailable: true });
    expect(unused).not.toHaveBeenCalled();
  });
});
