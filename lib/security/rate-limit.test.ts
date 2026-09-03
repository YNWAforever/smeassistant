import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hmacFingerprint, requestFingerprint } from "./request-fingerprint";
import {
  consumeRateLimit,
  enforceCompositeIdentifierRateLimit,
  enforceRateLimit,
  RATE_LIMITS,
  rateLimitBucketKey,
} from "./rate-limit";

describe("privacy-preserving request fingerprints", () => {
  beforeEach(() => {
    process.env.RATE_LIMIT_SECRET = "test-secret-a";
  });

  it("returns a fixed-length HMAC digest without the raw input", () => {
    const raw = "203.0.113.42";
    const digest = hmacFingerprint(raw);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain(raw);
    expect(rateLimitBucketKey("scan_start", raw)).not.toContain(raw);
  });

  it("changes when the secret changes", () => {
    const first = hmacFingerprint("person@example.test");
    process.env.RATE_LIMIT_SECRET = "test-secret-b";
    expect(hmacFingerprint("person@example.test")).not.toBe(first);
  });

  it("uses only the normalized proxy identity for request fingerprints", () => {
    const req = new Request("https://scanner.test", {
      headers: { "x-forwarded-for": " 203.0.113.42, 10.0.0.1 " },
    });
    expect(requestFingerprint(req)).toMatch(/^[0-9a-f]{64}$/);
    expect(requestFingerprint(req)).not.toContain("203.0.113.42");
  });

  // `x-forwarded-for` is an ordinary client request header. Trusting its
  // leftmost entry hands a caller both an unlimited supply of fresh buckets and
  // the ability to spend someone else's, on any host whose proxy appends rather
  // than overwrites. The platform header cannot be set by the caller.
  it("prefers the platform-set client IP over a caller-supplied forwarded-for", () => {
    const spoofed = new Request("https://scanner.test", {
      headers: { "x-forwarded-for": "198.51.100.7" },
    });
    const platform = new Request("https://scanner.test", {
      headers: { "x-vercel-forwarded-for": "203.0.113.42", "x-forwarded-for": "198.51.100.7" },
    });
    expect(requestFingerprint(platform)).toBe(hmacFingerprint("203.0.113.42"));
    expect(requestFingerprint(platform)).not.toBe(requestFingerprint(spoofed));
  });

  it("still falls back to the forwarded-for chain when no platform header is present", () => {
    const req = new Request("https://scanner.test", {
      headers: { "x-forwarded-for": "203.0.113.42, 10.0.0.1" },
    });
    expect(requestFingerprint(req)).toBe(hmacFingerprint("203.0.113.42"));
  });
});

describe("atomic rate-limit contract", () => {
  it("exposes the approved fixed windows", () => {
    expect(RATE_LIMITS.scan_start).toEqual({ limit: 10, windowSeconds: 3600 });
    expect(RATE_LIMITS.scan_process).toEqual({ limit: 20, windowSeconds: 3600 });
    expect(RATE_LIMITS.business_search).toEqual({ limit: 60, windowSeconds: 3600 });
    expect(RATE_LIMITS.scan_status).toEqual({ limit: 120, windowSeconds: 3600 });
    expect(RATE_LIMITS.report_unlock).toEqual({ limit: 5, windowSeconds: 3600 });
    expect(RATE_LIMITS.staff_magic_link).toEqual({ limit: 5, windowSeconds: 3600 });
    // A brute-force bound on the 6-digit fallback code, not a typo allowance:
    // 10 guesses against 1,000,000 possibilities is negligible per hour even
    // before Supabase's own per-token attempt limit is considered.
    expect(RATE_LIMITS.staff_otp_verify).toEqual({ limit: 10, windowSeconds: 3600 });
    expect(RATE_LIMITS.report_recovery).toEqual({ limit: 5, windowSeconds: 3600 });
    expect(RATE_LIMITS.composite_identifier_outer).toEqual({ limit: 1000, windowSeconds: 3600 });
    expect(RATE_LIMITS.staff_lead_contact).toEqual({ limit: 60, windowSeconds: 3600 });
    // Lower than disclosure on purpose: reading 60 contacts is recoverable,
    // erasing 60 reports is not.
    expect(RATE_LIMITS.staff_erasure).toEqual({ limit: 20, windowSeconds: 3600 });
    // Higher, and on its own bucket. A merchant asking to stop being contacted
    // must not be refused because staff spent the hour's disclosure quota.
    expect(RATE_LIMITS.staff_consent_withdrawal).toEqual({ limit: 120, windowSeconds: 3600 });
    // Staff-authenticated, so this is a runaway-cost guard against repeat
    // clicks (each call spends real LLM tokens), not an abuse boundary.
    expect(RATE_LIMITS.staff_fix_pack_generate).toEqual({ limit: 20, windowSeconds: 3600 });
  });

  it("checks the fingerprint-only outer bucket before the composite identifier bucket", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null })
      .mockResolvedValueOnce({ data: [{ allowed: false, retry_after_seconds: 23 }], error: null });
    await expect(enforceCompositeIdentifierRateLimit({
      req: new Request("https://scanner.test", { headers: { "x-forwarded-for": "203.0.113.42" } }),
      scope: "scan_status",
      identifier: "00000000-0000-4000-8000-000000000001",
      client: { rpc },
      failClosed: false,
    })).resolves.toEqual({ allowed: false, retryAfterSeconds: 23 });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(vi.mocked(rpc).mock.calls[0]?.[1]?.p_bucket_key)
      .toMatch(/^composite_identifier_outer:[0-9a-f]{64}:[0-9a-f]{64}$/);
    expect(vi.mocked(rpc).mock.calls[1]?.[1]?.p_bucket_key)
      .toMatch(/^scan_status:[0-9a-f]{64}:[0-9a-f]{64}$/);
  });

  // One shared outer bucket per caller made benign traffic starve the mutation
  // routes: a single scan spends ~25-30 status polls against the same 1000/hour
  // budget that gates report_unlock and both magic-link routes. Behind a shared
  // egress IP — carrier CGNAT, an office NAT — that is a few dozen scans away
  // from locking every unrelated visitor out of unlocking their own report.
  it("gives each inner scope its own outer bucket for the same caller", async () => {
    process.env.RATE_LIMIT_SECRET = "test-secret-a";
    const rpc = vi.fn(async (
      _functionName: string,
      _params: Record<string, unknown>,
    ) => ({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null }));
    const req = new Request("https://scanner.test", { headers: { "x-forwarded-for": "203.0.113.42" } });

    await enforceCompositeIdentifierRateLimit({
      req, scope: "scan_status", identifier: "job-1", client: { rpc }, failClosed: false,
    });
    await enforceCompositeIdentifierRateLimit({
      req, scope: "report_unlock", identifier: "slug-1", client: { rpc }, failClosed: true,
    });

    const outerKeys = vi.mocked(rpc).mock.calls
      .map((call) => String(call[1]?.p_bucket_key))
      .filter((key) => key.startsWith("composite_identifier_outer:"));
    expect(outerKeys).toHaveLength(2);
    expect(outerKeys[0]).not.toBe(outerKeys[1]);
  });

  it("stops before creating a composite bucket when the outer bucket is denied", async () => {
    const rpc = vi.fn(async () => ({ data: [{ allowed: false, retry_after_seconds: 31 }], error: null }));
    await expect(enforceCompositeIdentifierRateLimit({
      req: new Request("https://scanner.test"),
      scope: "report_unlock",
      identifier: "report-1234",
      client: { rpc },
      failClosed: true,
    })).resolves.toEqual({ allowed: false, retryAfterSeconds: 31 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("uses one consume_rate_limit RPC and returns retry metadata", async () => {
    const rpc = vi.fn(async () => ({ data: [{ allowed: false, retry_after_seconds: 17 }], error: null }));
    await expect(consumeRateLimit({
      client: { rpc },
      bucketKey: "scan_start:" + "a".repeat(64),
      ...RATE_LIMITS.scan_start,
    })).resolves.toEqual({ allowed: false, retryAfterSeconds: 17 });
    expect(rpc).toHaveBeenCalledWith("consume_rate_limit", {
      p_bucket_key: "scan_start:" + "a".repeat(64),
      p_limit: 10,
      p_window_seconds: 3600,
    });
  });

  it("fails closed when an unlock limiter RPC is unavailable", async () => {
    process.env.RATE_LIMIT_SECRET = "test-secret-a";
    const result = await enforceRateLimit({
      req: new Request("https://scanner.test"),
      scope: "report_unlock",
      identifiers: ["job-1"],
      client: { rpc: vi.fn(async () => ({ data: null, error: { message: "down" } })) },
      failClosed: true,
    });
    expect(result).toMatchObject({ allowed: false, unavailable: true });
  });

  it("keeps scan processing available when a non-required limiter is unavailable", async () => {
    process.env.RATE_LIMIT_SECRET = "test-secret-a";
    const result = await enforceRateLimit({
      req: new Request("https://scanner.test"),
      scope: "scan_process",
      identifiers: ["job-1"],
      client: { rpc: vi.fn(async () => ({ data: null, error: { message: "down" } })) },
      failClosed: false,
    });
    expect(result).toMatchObject({ allowed: true, unavailable: true });
  });

  it("uses separate business-search buckets for separate validated sessions", async () => {
    process.env.RATE_LIMIT_SECRET = "test-secret-a";
    const rpc = vi.fn(async (
      _functionName: string,
      _params: Record<string, unknown>,
    ) => ({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null }));
    const req = new Request("https://scanner.test", { headers: { "x-forwarded-for": "203.0.113.42" } });
    await enforceRateLimit({
      req,
      scope: "business_search",
      identifiers: ["00000000-0000-4000-8000-000000000001"],
      client: { rpc },
      failClosed: false,
    });
    await enforceRateLimit({
      req,
      scope: "business_search",
      identifiers: ["00000000-0000-4000-8000-000000000002"],
      client: { rpc },
      failClosed: false,
    });
    const keys = rpc.mock.calls.map((call) => String(call[1]?.p_bucket_key));
    expect(keys[0]).toMatch(/^business_search:[0-9a-f]{64}:[0-9a-f]{64}$/);
    expect(keys[1]).toMatch(/^business_search:[0-9a-f]{64}:[0-9a-f]{64}$/);
    expect(keys[0]).not.toBe(keys[1]);
  });
});

  it("indexes explicit expiry and deletes at most 100 expired buckets per RPC call", () => {
    const migrationPath = fileURLToPath(new URL(
      "../../supabase/migrations/20260715_add_rate_limit_rpc.sql",
      import.meta.url,
    ));
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/add column if not exists expires_at timestamptz/i);
    expect(sql).toMatch(/create index if not exists rate_limit_buckets_expires_at_idx/i);
    expect(sql).toMatch(/where expires_at <= now_at[\s\S]*limit 100[\s\S]*delete from public\.rate_limit_buckets/i);
    expect(sql).toMatch(/set search_path = ''/i);
  });
