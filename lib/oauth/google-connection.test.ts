import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildConsentUrl,
  googleOAuthClaimConfigured,
  needsRefresh,
  signClaimState,
  signForTest,
  signState,
  verifyClaimState,
  verifyState,
} from "./google-connection";

/**
 * `state` is the only CSRF defence on the OAuth return leg. If it can be forged,
 * an attacker completes the flow against their own Google account and binds it
 * to someone else's workspace — the connection then looks legitimate forever.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

function withKey(): void {
  vi.stubEnv("OAUTH_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
}

describe("oauth state", () => {
  it("round-trips the workspace it was issued for", () => {
    withKey();
    const payload = verifyState(signState("ws-1", "nonce-1"));

    expect(payload?.workspaceId).toBe("ws-1");
    expect(payload?.nonce).toBe("nonce-1");
  });

  it("rejects a tampered payload", () => {
    withKey();
    const [body, sig] = signState("ws-1").split(".");
    const forged = Buffer.from(
      JSON.stringify({ workspaceId: "ws-attacker", nonce: "n", issuedAt: Date.now() }),
      "utf8",
    ).toString("base64url");

    // The signature still belongs to the original body.
    expect(verifyState(`${forged}.${sig}`)).toBeNull();
    expect(body).not.toBe(forged);
  });

  it("rejects a tampered signature", () => {
    withKey();
    const [body] = signState("ws-1").split(".");

    expect(verifyState(`${body}.not-a-real-signature`)).toBeNull();
  });

  it("rejects state signed with a different key", () => {
    withKey();
    const sealed = signState("ws-1");

    vi.stubEnv("OAUTH_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"));
    expect(verifyState(sealed)).toBeNull();
  });

  it("expires state so a leaked consent URL cannot be replayed later", () => {
    withKey();
    const sealed = signState("ws-1");

    expect(verifyState(sealed, Date.now() + 11 * 60 * 1000)).toBeNull();
  });

  it("rejects state issued in the future", () => {
    withKey();
    const sealed = signState("ws-1");

    // Guards against a clock-skew payload minting an effectively immortal state.
    expect(verifyState(sealed, Date.now() - 5 * 60 * 1000)).toBeNull();
  });

  it("rejects malformed input without throwing", () => {
    withKey();

    expect(verifyState("")).toBeNull();
    expect(verifyState("no-dot")).toBeNull();
    expect(verifyState("!!!.???")).toBeNull();
  });

  it("rejects trailing junk appended after the signature", () => {
    withKey();
    // raw.split(".") alone would silently ignore anything past the second
    // segment, so "<state>.junk" would otherwise decode identically to
    // "<state>".
    expect(verifyState(`${signState("ws-1")}.junk`)).toBeNull();
  });

  // smeassistant addition: every owner route is locale-prefixed, so the
  // callback needs the locale the flow was started from.
  it("carries the locale through the signed payload when given", () => {
    withKey();
    const payload = verifyState(signState("ws-1", "nonce-1", "zh-TW"));

    expect(payload?.locale).toBe("zh-TW");
  });

  it("omits the locale key entirely when none is given, keeping the upstream payload shape", () => {
    withKey();
    const [body] = signState("ws-1", "nonce-1").split(".");
    const decoded = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"));

    expect(Object.keys(decoded).sort()).toEqual(["issuedAt", "nonce", "workspaceId"]);
    expect(verifyState(signState("ws-1", "nonce-1"))?.locale).toBeUndefined();
  });

  it("rejects a payload whose locale is not a string", () => {
    withKey();
    const [body, signature] = signState("ws-1", "nonce-1").split(".");
    const decoded = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"));
    const tampered = Buffer.from(JSON.stringify({ ...decoded, locale: 7 }), "utf8").toString("base64url");

    // The signature no longer matches either, but the type check is what a
    // locale-only tamper under a valid key would hit, so both are pinned.
    expect(verifyState(`${tampered}.${signature}`)).toBeNull();
    expect(verifyState(`${tampered}.${signForTest(tampered, "connect")}`)).toBeNull();
  });
});

describe("buildConsentUrl", () => {
  it("requests offline access with a forced consent prompt", () => {
    withKey();
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-123");
    vi.stubEnv("GOOGLE_OAUTH_REDIRECT_URI", "https://example.com/api/oauth/google/callback");

    const url = new URL(buildConsentUrl("state-abc"));

    // Without prompt=consent Google omits the refresh token on any repeat
    // authorisation and the connection silently becomes single-use.
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/business.manage");
    expect(url.searchParams.get("state")).toBe("state-abc");
    expect(url.searchParams.get("client_id")).toBe("client-123");
  });

  it("never puts the client secret in the consent URL", () => {
    withKey();
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-123");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "super-secret-value");
    vi.stubEnv("GOOGLE_OAUTH_REDIRECT_URI", "https://example.com/cb");

    expect(buildConsentUrl("s")).not.toContain("super-secret-value");
  });

  it("defaults the redirect_uri to GOOGLE_OAUTH_REDIRECT_URI when no explicit uri is given", () => {
    withKey();
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-123");
    vi.stubEnv("GOOGLE_OAUTH_REDIRECT_URI", "https://example.com/api/oauth/google/callback");

    const url = new URL(buildConsentUrl("state-abc"));

    expect(url.searchParams.get("redirect_uri")).toBe("https://example.com/api/oauth/google/callback");
  });

  it("uses an explicit redirect uri instead of GOOGLE_OAUTH_REDIRECT_URI when one is given", () => {
    // The claim flow must send Google back to its own callback
    // (/api/oauth/google/claim/callback), not the connect flow's
    // GOOGLE_OAUTH_REDIRECT_URI -- Google requires the token-exchange
    // redirect_uri to byte-match the one used at authorization, so getting
    // this wrong makes the claim callback unreachable via a real consent.
    withKey();
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-123");
    vi.stubEnv("GOOGLE_OAUTH_REDIRECT_URI", "https://example.com/api/oauth/google/callback");

    const url = new URL(buildConsentUrl("state-abc", "https://example.com/api/oauth/google/claim/callback"));

    expect(url.searchParams.get("redirect_uri")).toBe("https://example.com/api/oauth/google/claim/callback");
  });
});

describe("googleOAuthClaimConfigured", () => {
  it("is false when the base connect config is missing, even with a claim redirect uri set", () => {
    vi.stubEnv("GOOGLE_OAUTH_CLAIM_REDIRECT_URI", "https://example.com/api/oauth/google/claim/callback");
    // No signing key, no client id/secret, no GOOGLE_OAUTH_REDIRECT_URI.
    expect(googleOAuthClaimConfigured()).toBe(false);
  });

  it("is false when the base connect config is present but the claim redirect uri is unset", () => {
    // An unset claim redirect uri is the same unreachable-route bug as Fix 2
    // fixes, just moved to a missing-env-var failure instead of a wrong-uri
    // one -- so this must fail closed exactly like googleOAuthConfigured()
    // does for the connect flow.
    withKey();
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-123");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "secret-123");
    vi.stubEnv("GOOGLE_OAUTH_REDIRECT_URI", "https://example.com/api/oauth/google/callback");

    expect(googleOAuthClaimConfigured()).toBe(false);
  });

  it("is true once both the base connect config and the claim redirect uri are set", () => {
    withKey();
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-123");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "secret-123");
    vi.stubEnv("GOOGLE_OAUTH_REDIRECT_URI", "https://example.com/api/oauth/google/callback");
    vi.stubEnv("GOOGLE_OAUTH_CLAIM_REDIRECT_URI", "https://example.com/api/oauth/google/claim/callback");

    expect(googleOAuthClaimConfigured()).toBe(true);
  });
});

describe("needsRefresh", () => {
  it("refreshes inside the skew window", () => {
    expect(needsRefresh(new Date(Date.now() + 60_000).toISOString())).toBe(true);
  });

  it("leaves a comfortably valid token alone", () => {
    expect(needsRefresh(new Date(Date.now() + 60 * 60_000).toISOString())).toBe(false);
  });

  it("treats a missing or unparseable expiry as due", () => {
    expect(needsRefresh(null)).toBe(true);
    expect(needsRefresh("not-a-date")).toBe(true);
  });
});

describe("signClaimState / verifyClaimState", () => {
  it("round-trips a valid claim state", () => {
    withKey();
    const state = signClaimState("job-1", "ChIJ_test_place_id", "slug-1", "nonce-1");
    const payload = verifyClaimState(state);
    expect(payload).toEqual({
      jobId: "job-1",
      placeId: "ChIJ_test_place_id",
      slug: "slug-1",
      nonce: "nonce-1",
      issuedAt: expect.any(Number),
    });
  });

  it("rejects a tampered payload", () => {
    withKey();
    const state = signClaimState("job-1", "ChIJ_test_place_id", "slug-1");
    const [body, signature] = state.split(".");
    const tampered = `${body}x.${signature}`;
    expect(verifyClaimState(tampered)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    withKey();
    const state = signClaimState("job-1", "place-a", "slug-1");
    const [body] = state.split(".");
    expect(verifyClaimState(`${body}.not-a-real-signature`)).toBeNull();
  });

  it("rejects a state signed for a different job or place", () => {
    withKey();
    // Proves the two fields are both part of the signed payload, not just
    // jobId -- a state minted for job A's place_id must not verify as valid
    // for job B, even if an attacker could somehow swap only the placeId
    // field in transit.
    const state = signClaimState("job-1", "place-a", "slug-1");
    const [body, signature] = state.split(".");
    const decoded = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"));
    const swapped = Buffer.from(
      JSON.stringify({ ...decoded, placeId: "place-b" }),
      "utf8",
    ).toString("base64url");
    expect(verifyClaimState(`${swapped}.${signature}`)).toBeNull();
  });

  it("rejects a claim state whose placeId is not a string", () => {
    withKey();
    expect(verifyClaimState(signClaimState("job-1", 12345 as unknown as string, "slug-1", "n"))).toBeNull();
  });

  it("rejects a claim state whose slug is not a string", () => {
    withKey();
    expect(verifyClaimState(signClaimState("job-1", "place-a", 12345 as unknown as string))).toBeNull();
  });

  it("rejects a claim state whose nonce is not a string", () => {
    withKey();
    expect(verifyClaimState(signClaimState("job-1", "place-a", "slug-1", 999 as unknown as string))).toBeNull();
  });

  it("rejects an expired claim state", () => {
    withKey();
    const state = signClaimState("job-1", "place-a", "slug-1");
    const elevenMinutesLater = Date.now() + 11 * 60 * 1000;
    expect(verifyClaimState(state, elevenMinutesLater)).toBeNull();
  });

  it("rejects a claim state issued in the future", () => {
    withKey();
    const state = signClaimState("job-1", "place-a", "slug-1");
    // Guards against a clock-skew payload minting an effectively immortal
    // state. Mirrors the connect suite's equivalent test: simulate a future
    // issuedAt by passing verifyClaimState an earlier `now` than the state's
    // real signing time.
    expect(verifyClaimState(state, Date.now() - 5 * 60 * 1000)).toBeNull();
  });

  it("rejects a claim state signed with a different key", () => {
    withKey();
    const sealed = signClaimState("job-1", "place-a", "slug-1");

    vi.stubEnv("OAUTH_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"));
    expect(verifyClaimState(sealed)).toBeNull();
  });

  it("rejects malformed input without throwing", () => {
    withKey();

    expect(verifyClaimState("")).toBeNull();
    expect(verifyClaimState("no-dot")).toBeNull();
    expect(verifyClaimState("!!!.???")).toBeNull();
  });

  it("rejects trailing junk appended after the signature", () => {
    withKey();
    // raw.split(".") alone would silently ignore anything past the second
    // segment, so "<state>.junk" would otherwise decode identically to
    // "<state>".
    expect(verifyClaimState(`${signClaimState("job-1", "place-a", "slug-1")}.junk`)).toBeNull();
  });

  it("rejects a claim-shaped payload signed under the connect domain, not just the claim-guard's field check", () => {
    withKey();
    // Directly pins the domain-separation fix. A body shaped exactly like a
    // valid ClaimStatePayload would sail through isClaimStatePayload's type
    // checks, so if this is rejected, it can only be the signature -- signed
    // here the way signState's own path signs a connect-flow state (domain
    // "connect") -- failing to validate under the claim domain. Without this
    // test, deleting the domain tag from `sign` leaves every other test green,
    // because the type guard happens to also reject a real connect-flow state
    // today, for the unrelated reason that it lacks jobId/placeId.
    const body = Buffer.from(
      JSON.stringify({ jobId: "victim-job", placeId: "place-a", slug: "slug-1", nonce: "n", issuedAt: Date.now() }),
      "utf8",
    ).toString("base64url");
    const connectDomainSignature = signForTest(body, "connect");
    expect(verifyClaimState(`${body}.${connectDomainSignature}`)).toBeNull();
  });

  // smeassistant addition: see the connect-flow locale tests above.
  it("carries the locale through the claim payload when given, and omits it otherwise", () => {
    withKey();
    expect(verifyClaimState(signClaimState("job-1", "place-a", "slug-1", "n", "en"))).toEqual({
      jobId: "job-1",
      placeId: "place-a",
      slug: "slug-1",
      nonce: "n",
      issuedAt: expect.any(Number),
      locale: "en",
    });
    const [body] = signClaimState("job-1", "place-a", "slug-1", "n").split(".");
    const decoded = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"));
    expect(Object.keys(decoded).sort()).toEqual(["issuedAt", "jobId", "nonce", "placeId", "slug"]);
  });

  it("rejects a claim payload whose locale is not a string", () => {
    withKey();
    const body = Buffer.from(
      JSON.stringify({ jobId: "job-1", placeId: "place-a", slug: "slug-1", nonce: "n", issuedAt: Date.now(), locale: 7 }),
      "utf8",
    ).toString("base64url");
    expect(verifyClaimState(`${body}.${signForTest(body, "claim")}`)).toBeNull();
  });

  it("does not verify a connect-flow state as a claim state", () => {
    withKey();
    // The two state kinds must not be interchangeable -- a leaked connect
    // state must not be replayable against the claim callback. Enforced
    // cryptographically now (separate HMAC domains, see `sign` in
    // google-connection.ts), not merely by the two payload shapes happening
    // to be disjoint.
    const connectState = signState("ws-1", "nonce-1");
    expect(verifyClaimState(connectState)).toBeNull();
  });
});
