// Encryption at rest for OAuth tokens.
//
// A stored refresh token grants standing access to a merchant's Google Business
// Profile, so the format is authenticated (AES-256-GCM) rather than merely
// encrypted: a row modified in the database fails to decrypt instead of yielding
// altered plaintext.
//
// Ciphertext is stored as `v1.<iv>.<ciphertext>.<tag>`, base64url per part. The
// version prefix is the whole point of the leading field — when the key is
// rotated, a v2 reader can identify which scheme produced a given row instead of
// inferring it from length, and this v1 reader refuses v2 rather than misparsing
// it.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
/** 96 bits — the IV length GCM is specified for; other lengths weaken it. */
const IV_BYTES = 12;
/** GCM tag length Node emits by default. */
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const MIN_PRODUCTION_SECRET_BYTES = 32;
const DEVELOPMENT_TOKEN_SECRET = "sme-scanner-development-secret";

/**
 * Resolves the AES key, mirroring `report-access/token.ts`: production demands a
 * real secret, development falls back so local work is not blocked.
 *
 * The env var is base64. Non-production hashes the development constant rather
 * than padding it, because AES-256 needs exactly 32 bytes and a short constant
 * would otherwise have to be padded with a fixed byte — which is a weaker key
 * than its length suggests.
 */
function encryptionKey(): Buffer {
  const configured = process.env.OAUTH_TOKEN_ENCRYPTION_KEY?.trim();

  if (process.env.NODE_ENV === "production") {
    const decoded = configured ? Buffer.from(configured, "base64") : Buffer.alloc(0);
    if (decoded.length < MIN_PRODUCTION_SECRET_BYTES) {
      throw new Error("OAUTH_TOKEN_ENCRYPTION_KEY must be at least 32 bytes in production");
    }
    return decoded.subarray(0, KEY_BYTES);
  }

  const decoded = configured ? Buffer.from(configured, "base64") : Buffer.alloc(0);
  if (decoded.length >= KEY_BYTES) return decoded.subarray(0, KEY_BYTES);
  return createHash("sha256").update(DEVELOPMENT_TOKEN_SECRET).digest();
}

/** Encrypts a token for storage. Output is safe to persist as text. */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return [
    VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

/**
 * Reverses `encryptToken`.
 *
 * Throws on a tampered, truncated, wrongly-keyed, or future-versioned payload —
 * every failure mode is a throw rather than a null return, because a caller that
 * forgets to check a null would proceed with an empty token and produce a far
 * more confusing failure against Google.
 */
export function decryptToken(sealed: string): string {
  const parts = sealed.split(".");
  if (parts.length !== 4) {
    throw new Error("token-crypto: malformed payload");
  }

  const [version, iv, ciphertext, tag] = parts as [string, string, string, string];
  if (version !== VERSION) {
    throw new Error(`token-crypto: unsupported payload version "${version}"`);
  }

  // createDecipheriv and setAuthTag were previously outside the try. Buffer.from
  // with base64url never throws — it silently drops invalid characters and
  // returns a short buffer — so a truncated column made those two lines throw
  // Node's raw `Invalid initialization vector` / `Invalid authentication tag
  // length: 10` instead of the sanitized error this function documents, which
  // is exactly the truncated-payload case the contract names.
  try {
    const ivBytes = Buffer.from(iv, "base64url");
    const tagBytes = Buffer.from(tag, "base64url");
    if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES) {
      throw new Error("token-crypto: malformed payload");
    }

    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), ivBytes);
    decipher.setAuthTag(tagBytes);
    // `final()` is what verifies the tag, so it must be inside this try too.
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // The underlying message ("unable to authenticate data") says nothing useful
    // to a caller and risks being logged verbatim alongside the payload.
    throw new Error("token-crypto: payload failed authentication");
  }
}
