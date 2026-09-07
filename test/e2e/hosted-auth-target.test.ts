import { describe, it, expect } from "vitest";
import { hostedAuthMailRequest, hostedAuthTarget } from "./hosted-auth-target";
const env = {
  NEON_AUTH_TEST_AUTHORIZED: "yes",
  NEON_AUTH_TEST_ISOLATED: "yes",
  NEON_AUTH_TEST_ORIGIN: "https://isolated.example.test",
  NEON_AUTH_TEST_BRANCH: "br-owned-test",
  NEON_AUTH_TEST_PROVIDER_ORIGIN: "https://isolated-auth.example.test",
  NEON_AUTH_TEST_PRODUCTION_PROVIDER_ORIGIN:
    "https://production-auth.example.test",
  NEON_AUTH_TEST_PRODUCTION_ORIGIN: "https://production.example.test",
  NEON_AUTH_TEST_REDEMPTION_RECIPIENT: "redemption@example.test",
  NEON_AUTH_TEST_EXPIRY_RECIPIENT: "expiry@example.test",
  NEON_AUTH_TEST_INBOX_URL: "https://inbox.example.test/messages",
  NEON_AUTH_TEST_GOOGLE_EMAIL: "approved@example.test",
  NEON_AUTH_TEST_GOOGLE_STATE: "authorized-google-state.json",
  NEON_AUTH_TEST_LINK_TTL_MS: "60000",
};
describe("hosted suite opt-in", () => {
  it("refuses unselected targets and unauthorized execution", () => {
    expect(() => hostedAuthTarget({})).toThrow();
    expect(() =>
      hostedAuthTarget({ ...env, NEON_AUTH_TEST_AUTHORIZED: "no" }),
    ).toThrow();
  });
  it("refuses production alias, missing isolation, non-HTTPS and unnamed branch", () => {
    for (const override of [
      { NEON_AUTH_TEST_ORIGIN: env.NEON_AUTH_TEST_PRODUCTION_ORIGIN },
      { NEON_AUTH_TEST_ISOLATED: "no" },
      { NEON_AUTH_TEST_ORIGIN: "http://isolated.example.test" },
      { NEON_AUTH_TEST_BRANCH: "main" },
      {
        NEON_AUTH_TEST_PROVIDER_ORIGIN:
          env.NEON_AUTH_TEST_PRODUCTION_PROVIDER_ORIGIN,
      },
      { NEON_AUTH_TEST_LINK_TTL_MS: "0" },
    ])
      expect(() => hostedAuthTarget({ ...env, ...override })).toThrow();
  });
  it("requires distinct authorized recipients for redemption and expiry", () => {
    expect(() =>
      hostedAuthTarget({ ...env, NEON_AUTH_TEST_EXPIRY_RECIPIENT: undefined }),
    ).toThrow();
    expect(() =>
      hostedAuthTarget({
        ...env,
        NEON_AUTH_TEST_EXPIRY_RECIPIENT:
          env.NEON_AUTH_TEST_REDEMPTION_RECIPIENT,
      }),
    ).toThrow();
  });
  it("keeps the expiry mail request obtainable after redemption consumes the first recipient", () => {
    const target = hostedAuthTarget(env);
    const consumedRecipients = new Set<string>();
    const requestLink = (scenario: "redemption" | "expiry") => {
      const request = hostedAuthMailRequest(
        target,
        scenario,
        "2026-09-07T00:00:00.000Z",
      );
      if (consumedRecipients.has(request.recipient))
        throw new Error("invite_already_consumed");
      return request;
    };
    const redemption = requestLink("redemption");
    consumedRecipients.add(redemption.recipient);
    const expiry = requestLink("expiry");
    expect(redemption).toMatchObject({
      recipient: env.NEON_AUTH_TEST_REDEMPTION_RECIPIENT,
      inboxParams: { recipient: env.NEON_AUTH_TEST_REDEMPTION_RECIPIENT },
    });
    expect(expiry).toMatchObject({
      recipient: env.NEON_AUTH_TEST_EXPIRY_RECIPIENT,
      inboxParams: { recipient: env.NEON_AUTH_TEST_EXPIRY_RECIPIENT },
    });
  });
  it("returns only an explicit isolated target with authorized accounts", () => {
    expect(hostedAuthTarget(env).origin).toBe(env.NEON_AUTH_TEST_ORIGIN);
  });
});
