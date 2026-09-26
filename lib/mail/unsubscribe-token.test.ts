import { describe, expect, it } from "vitest";

import {
  signUnsubscribeToken,
  UNSUBSCRIBE_TTL_MS,
  verifyUnsubscribeToken,
  type UnsubscribePayload,
} from "./unsubscribe-token";

const SECRET_A = "a".repeat(32);
const SECRET_B = "b".repeat(32);

const FIXED_NOW = 1_800_000_000_000;

function payload(overrides: Partial<UnsubscribePayload> = {}): UnsubscribePayload {
  return {
    userId: "user-1",
    workspaceId: "workspace-1",
    kind: "rescan_complete",
    expiresAt: FIXED_NOW + UNSUBSCRIBE_TTL_MS,
    ...overrides,
  };
}

describe("unsubscribe token", () => {
  it("round-trips a valid payload", () => {
    const token = signUnsubscribeToken(payload(), SECRET_A);
    expect(verifyUnsubscribeToken(token, SECRET_A, FIXED_NOW)).toEqual(payload());
  });

  it("90-day TTL constant matches the spec", () => {
    expect(UNSUBSCRIBE_TTL_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it("rejects a tampered payload segment", () => {
    const token = signUnsubscribeToken(payload(), SECRET_A);
    const [encodedPayload, signature] = token.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify(payload({ workspaceId: "workspace-attacker" })), "utf8").toString(
      "base64url",
    );
    expect(verifyUnsubscribeToken(`${tamperedPayload}.${signature}`, SECRET_A, FIXED_NOW)).toBeNull();
    // sanity: the untampered token part is what we started from
    expect(encodedPayload).not.toEqual(tamperedPayload);
  });

  it("rejects a tampered signature segment", () => {
    const token = signUnsubscribeToken(payload(), SECRET_A);
    const [encodedPayload, signature] = token.split(".");
    const flippedChar = signature[0] === "A" ? "B" : "A";
    const tamperedSignature = flippedChar + signature.slice(1);
    expect(verifyUnsubscribeToken(`${encodedPayload}.${tamperedSignature}`, SECRET_A, FIXED_NOW)).toBeNull();
  });

  it("rejects a token verified with a different secret", () => {
    const token = signUnsubscribeToken(payload(), SECRET_A);
    expect(verifyUnsubscribeToken(token, SECRET_B, FIXED_NOW)).toBeNull();
  });

  it("rejects an expired token", () => {
    const expiresAt = Date.now() + 1000;
    const token = signUnsubscribeToken(payload({ expiresAt }), SECRET_A);
    expect(verifyUnsubscribeToken(token, SECRET_A, expiresAt + 1)).toBeNull();
  });

  it("accepts a token exactly at its expiry boundary minus one ms", () => {
    const expiresAt = Date.now() + 1000;
    const token = signUnsubscribeToken(payload({ expiresAt }), SECRET_A);
    expect(verifyUnsubscribeToken(token, SECRET_A, expiresAt - 1)).toEqual(payload({ expiresAt }));
  });

  it("rejects an unknown mail kind", () => {
    const token = signUnsubscribeToken(
      { ...payload(), kind: "not_a_real_kind" as UnsubscribePayload["kind"] },
      SECRET_A,
    );
    expect(verifyUnsubscribeToken(token, SECRET_A, FIXED_NOW)).toBeNull();
  });

  it("rejects a malformed token string", () => {
    expect(verifyUnsubscribeToken("abc", SECRET_A, FIXED_NOW)).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(verifyUnsubscribeToken("", SECRET_A, FIXED_NOW)).toBeNull();
  });
});
