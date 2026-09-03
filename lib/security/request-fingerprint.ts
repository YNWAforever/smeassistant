import { createHmac } from "node:crypto";

/**
 * A dedicated error lets mutation routes distinguish a missing limiter secret
 * from a normal denied request. The digest itself is the only identity value
 * that is ever persisted in rate_limit_buckets.
 */
export class RateLimitConfigurationError extends Error {
  constructor(message = "RATE_LIMIT_SECRET is not configured") {
    super(message);
    this.name = "RateLimitConfigurationError";
  }
}

const TEST_SECRET = "sme-scanner-rate-limit-test-secret";

export function rateLimitSecret(): string {
  const configured = process.env.RATE_LIMIT_SECRET?.trim();
  if (configured) return configured;
  // Vitest has no deployment secret. This deterministic test-only fallback
  // keeps unit tests hermetic while production and preview fail closed when a
  // required secret has not been provisioned.
  if (process.env.NODE_ENV === "test") return TEST_SECRET;
  throw new RateLimitConfigurationError();
}

export function normalizeFingerprintInput(value: string): string {
  return value.trim().toLowerCase().slice(0, 512);
}

/** Return a one-way HMAC digest; raw identity values are never returned. */
export function hmacFingerprint(value: string, secret = rateLimitSecret()): string {
  return createHmac("sha256", secret)
    .update(normalizeFingerprintInput(value), "utf8")
    .digest("hex");
}

/**
 * Resolve the caller identity every rate-limit bucket is keyed on.
 *
 * `x-forwarded-for` is an ordinary client request header. Reading its leftmost
 * entry is only safe where a proxy overwrites it, which the current host does —
 * but nothing in the code says so, and on any host that appends instead, the
 * leftmost entry is whatever the caller typed. That is two problems at once: a
 * caller mints an unlimited supply of fresh buckets by varying the header, and
 * spends someone else's by claiming their IP, which is a targeted denial of
 * service against the fail-closed unlock and magic-link routes.
 *
 * So prefer a header the platform sets and the caller cannot: `x-vercel-*` is
 * stripped from inbound requests and re-set at the edge. The forwarded-for
 * chain stays as the fallback for local development and any other host.
 */
export function clientIp(req: Request): string {
  const platform = req.headers.get("x-vercel-forwarded-for")?.split(",", 1)[0]?.trim();
  if (platform) return platform;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "anonymous";
}

/** HMAC fingerprint for the request's best available proxy identity. */
export function requestFingerprint(req: Request): string {
  return hmacFingerprint(clientIp(req));
}
