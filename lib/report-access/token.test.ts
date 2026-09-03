import { afterEach, describe, expect, it, vi } from "vitest";
import {
  VIEWER_GRANT_COOKIE,
  createIdempotencyKey,
  createViewerToken,
  createViewerTokenFromIdempotencyKey,
  isValidIdempotencyKey,
  encodeViewerGrantCookie,
  hashViewerToken,
  parseViewerGrantCookie,
  secureViewerCookieOptions,
  tokenHashMatches,
} from "./token";

describe("viewer grant tokens", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it("creates a 32-byte token and stores only its sha256 hash", () => {
    const grant = createViewerToken();

    expect(Buffer.from(grant.rawToken, "base64url")).toHaveLength(32);
    expect(grant.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(grant.tokenHash).not.toContain(grant.rawToken);
    expect(hashViewerToken(grant.rawToken)).toBe(grant.tokenHash);
  });

  it("compares hashes in constant time and rejects malformed or different tokens", () => {
    const grant = createViewerToken();

    expect(tokenHashMatches(grant.rawToken, grant.tokenHash)).toBe(true);
    expect(tokenHashMatches(`${grant.rawToken}x`, grant.tokenHash)).toBe(false);
    expect(tokenHashMatches(grant.rawToken, "not-a-sha256-hash")).toBe(false);
  });

  it("encodes only grant id and opaque token in the secure cookie payload", () => {
    const grant = createViewerToken();
    const cookie = encodeViewerGrantCookie("grant-1", grant.rawToken);
    const parsed = parseViewerGrantCookie(cookie);

    expect(parsed).toEqual({ grantId: "grant-1", rawToken: grant.rawToken });
    expect(cookie).not.toContain("share-slug");
    expect(cookie).not.toContain("@example.com");
    expect(VIEWER_GRANT_COOKIE).toBe("sme_report_grant");
    expect(secureViewerCookieOptions).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  });

  it("derives the same 32-byte viewer token for a retry key without storing plaintext", () => {
    const key = createIdempotencyKey();
    expect(Buffer.from(key, "base64url")).toHaveLength(32);
    expect(isValidIdempotencyKey(key)).toBe(true);

    const first = createViewerTokenFromIdempotencyKey(key);
    const retry = createViewerTokenFromIdempotencyKey(key);
    expect(retry).toEqual(first);
    expect(Buffer.from(first.rawToken, "base64url")).toHaveLength(32);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.tokenHash).not.toContain(key);
  });

  it("fails closed when the production token secret is missing or weak", () => {
    const key = createIdempotencyKey();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REPORT_ACCESS_TOKEN_SECRET", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "repository-visible-service-role-placeholder");

    expect(() => createViewerTokenFromIdempotencyKey(key)).toThrow(
      "REPORT_ACCESS_TOKEN_SECRET must be at least 32 bytes in production",
    );

    vi.stubEnv("REPORT_ACCESS_TOKEN_SECRET", "too-short");
    expect(() => createViewerTokenFromIdempotencyKey(key)).toThrow(
      "REPORT_ACCESS_TOKEN_SECRET must be at least 32 bytes in production",
    );
  });
  it("rejects idempotency keys that are not exactly 32 random bytes", () => {
    expect(isValidIdempotencyKey("short")).toBe(false);
    expect(isValidIdempotencyKey("!".repeat(43))).toBe(false);
  });

  it("rejects malformed cookie payloads", () => {
    expect(parseViewerGrantCookie(undefined)).toBeNull();
    expect(parseViewerGrantCookie("grant-only")).toBeNull();
    expect(parseViewerGrantCookie("grant.too.many.parts")) .toBeNull();
    expect(parseViewerGrantCookie("grant.bad-token!")) .toBeNull();
  });
});
