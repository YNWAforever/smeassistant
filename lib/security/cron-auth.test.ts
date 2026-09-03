import { afterEach, describe, expect, it } from "vitest";
import { authorizeCronRequest, cronUnauthorizedResponse } from "./cron-auth";

const SECRET = "a".repeat(32);
const original = process.env.CRON_SECRET;

afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

function request(authorization?: string) {
  return new Request("https://example.test/api/cron/dispatch", {
    headers: authorization ? { authorization } : {},
  });
}

describe("authorizeCronRequest", () => {
  it("accepts the configured bearer secret", () => {
    process.env.CRON_SECRET = SECRET;
    expect(authorizeCronRequest(request(`Bearer ${SECRET}`))).toBe(true);
  });

  it("rejects a wrong secret of the same length", () => {
    process.env.CRON_SECRET = SECRET;
    expect(authorizeCronRequest(request(`Bearer ${"b".repeat(32)}`))).toBe(false);
  });

  it("rejects a secret of a different length without throwing", () => {
    // timingSafeEqual throws on unequal buffer lengths; an unguarded call turns
    // a wrong password into a 500 and a stack trace.
    process.env.CRON_SECRET = SECRET;
    expect(authorizeCronRequest(request("Bearer short"))).toBe(false);
  });

  it("rejects a missing header", () => {
    process.env.CRON_SECRET = SECRET;
    expect(authorizeCronRequest(request())).toBe(false);
  });

  it("rejects a non-bearer scheme", () => {
    process.env.CRON_SECRET = SECRET;
    expect(authorizeCronRequest(request(`Basic ${SECRET}`))).toBe(false);
  });

  it("fails closed when no secret is configured", () => {
    delete process.env.CRON_SECRET;
    expect(authorizeCronRequest(request("Bearer anything"))).toBe(false);
    expect(authorizeCronRequest(request())).toBe(false);
  });

  it("fails closed on a secret too short to be worth anything", () => {
    process.env.CRON_SECRET = "short";
    expect(authorizeCronRequest(request("Bearer short"))).toBe(false);
  });
});

describe("cronUnauthorizedResponse", () => {
  it("is a bare 401 that names nothing", async () => {
    const response = cronUnauthorizedResponse();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });
});
