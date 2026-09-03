import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptToken, encryptToken } from "./token-crypto";

/**
 * OAuth refresh tokens are the one secret in this product that grants standing
 * access to someone else's Google Business Profile. They are stored at rest, so
 * the storage format has to fail loudly rather than quietly hand back plaintext
 * that was tampered with.
 *
 * AES-256-GCM is authenticated encryption: the tag makes a modified ciphertext
 * unreadable rather than merely wrong. These tests exist to prove that property
 * holds through the wrapper, not just in principle.
 */

// 32 bytes, base64. Fixed so a failure is reproducible.
const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");

function useKey(key: string): void {
  vi.stubEnv("OAUTH_TOKEN_ENCRYPTION_KEY", key);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("token-crypto", () => {
  it("round-trips a token", () => {
    useKey(KEY_A);
    const plaintext = "1//0eXampleRefreshToken_with-symbols.and~stuff";

    expect(decryptToken(encryptToken(plaintext))).toBe(plaintext);
  });

  it("emits the versioned four-part format", () => {
    useKey(KEY_A);

    const parts = encryptToken("hello").split(".");

    // The version prefix is what lets a future key rotation identify which
    // scheme produced a given row instead of guessing from length.
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
  });

  it("never emits the same ciphertext twice for one plaintext", () => {
    useKey(KEY_A);

    // A reused IV in GCM is catastrophic, not untidy: it leaks the XOR of two
    // plaintexts and forfeits authentication. Distinct output is the observable
    // proof that a fresh IV is drawn per call.
    expect(encryptToken("same")).not.toBe(encryptToken("same"));
  });

  it("rejects a tampered ciphertext instead of returning garbage", () => {
    useKey(KEY_A);
    const [version, iv, ciphertext, tag] = encryptToken("sensitive").split(".");
    const flipped = Buffer.from(ciphertext!, "base64url");
    flipped[0] = flipped[0]! ^ 0xff;

    expect(() =>
      decryptToken([version, iv, flipped.toString("base64url"), tag].join(".")),
    ).toThrow();
  });

  it("rejects a tampered auth tag", () => {
    useKey(KEY_A);
    const [version, iv, ciphertext, tag] = encryptToken("sensitive").split(".");
    const flipped = Buffer.from(tag!, "base64url");
    flipped[0] = flipped[0]! ^ 0xff;

    expect(() =>
      decryptToken([version, iv, ciphertext, flipped.toString("base64url")].join(".")),
    ).toThrow();
  });

  it("cannot decrypt with a different key", () => {
    useKey(KEY_A);
    const sealed = encryptToken("sensitive");

    useKey(KEY_B);
    expect(() => decryptToken(sealed)).toThrow();
  });

  it("rejects an unknown version prefix", () => {
    useKey(KEY_A);
    const sealed = encryptToken("sensitive");

    // A v2 row reaching v1 code must fail closed rather than be misparsed.
    expect(() => decryptToken(`v2.${sealed.split(".").slice(1).join(".")}`)).toThrow(
      /unsupported/i,
    );
  });

  it("rejects a malformed payload", () => {
    useKey(KEY_A);

    expect(() => decryptToken("v1.only-two-parts")).toThrow();
    expect(() => decryptToken("")).toThrow();
  });

  it("throws in production when the key is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OAUTH_TOKEN_ENCRYPTION_KEY", "");

    expect(() => encryptToken("x")).toThrow(
      "OAUTH_TOKEN_ENCRYPTION_KEY must be at least 32 bytes in production",
    );
  });

  it("throws in production when the key is too short", () => {
    vi.stubEnv("NODE_ENV", "production");
    // 16 bytes: valid base64, but half an AES-256 key.
    vi.stubEnv("OAUTH_TOKEN_ENCRYPTION_KEY", Buffer.alloc(16, 3).toString("base64"));

    expect(() => encryptToken("x")).toThrow(
      "OAUTH_TOKEN_ENCRYPTION_KEY must be at least 32 bytes in production",
    );
  });

  it("falls back to a development key outside production", () => {
    // Mirrors report-access/token.ts: a missing secret must not stop local work,
    // and the fallback must still be a usable 32-byte key.
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("OAUTH_TOKEN_ENCRYPTION_KEY", "");

    expect(decryptToken(encryptToken("local"))).toBe("local");
  });
});
