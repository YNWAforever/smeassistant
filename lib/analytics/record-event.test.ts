import { describe, expect, it } from "vitest";
import {
  ANALYTICS_SESSION_COOKIE,
  resolveAnalyticsSession,
  setAnalyticsSessionCookie,
} from "./record-event";

describe("analytics session", () => {
  it("uses an anonymous analytics cookie independent from the report grant", () => {
    const request = new Request("https://scanner.test/report", {
      headers: { cookie: "sme_report_grant=grant.secret; sme_analytics_session=11111111-1111-4111-8111-111111111111" },
    });

    expect(resolveAnalyticsSession(request)).toEqual({ id: "11111111-1111-4111-8111-111111111111", created: false });
  });

  it("ignores malformed encoded cookie values instead of breaking the request", () => {
    const session = resolveAnalyticsSession(new Request("https://scanner.test/report", {
      headers: { cookie: "sme_analytics_session=%E0%A4%A" },
    }));

    expect(session.created).toBe(true);
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("replaces caller-controlled analytics cookie values with a generated UUID", () => {
    const session = resolveAnalyticsSession(new Request("https://scanner.test/report", {
      headers: { cookie: "sme_analytics_session=customer_name" },
    }));

    expect(session.created).toBe(true);
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.id).not.toBe("customer_name");
  });
  it("creates only the anonymous analytics cookie when none exists", () => {
    const session = resolveAnalyticsSession(new Request("https://scanner.test/report", {
      headers: { cookie: "sme_report_grant=grant.secret" },
    }));
    const response = new Response();
    setAnalyticsSessionCookie(response, session);

    expect(session.created).toBe(true);
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("set-cookie")).toContain(ANALYTICS_SESSION_COOKIE + "=" + session.id);
    expect(response.headers.get("set-cookie")).not.toContain("sme_report_grant");
  });
});
