import { afterEach, describe, expect, it, vi } from "vitest";

import { MAIL_TEMPLATES_VERSION } from "./availability";
import { sendGated } from "./send-gated";
import type { MailMessage, MailTransport } from "./transport";

const OPEN_ENV = {
  APPLICATION_MAIL_APPROVED: MAIL_TEMPLATES_VERSION,
  RESEND_API_KEY: "re_fixture",
  REPORT_EMAIL_FROM: "notify@example.com",
  APP_ORIGIN: "https://example.com",
  MAIL_UNSUBSCRIBE_SECRET: "a".repeat(32),
};

function message(to: string): MailMessage {
  return { to, subject: "s", text: "t", dedupeKey: "k" };
}

function fakeTransport(send = vi.fn(async () => ({ status: "accepted_by_provider" as const, providerMessageId: "p1" }))) {
  return { send } satisfies MailTransport;
}

describe("sendGated", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not send while mail is closed", async () => {
    const transport = fakeTransport();
    const result = await sendGated({ transport, env: {}, message: message("a@x.test") });
    expect(result).toEqual({ status: "not_configured", error: "mail_closed" });
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("does not send to an address outside the allowlist", async () => {
    const transport = fakeTransport();
    const env = { ...OPEN_ENV, MAIL_RECIPIENT_ALLOWLIST: "a@x.test" };
    const result = await sendGated({ transport, env, message: message("B@x.test") });
    expect(result).toEqual({ status: "not_configured", error: "not_allowlisted" });
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("matches the allowlist case- and whitespace-insensitively", async () => {
    const transport = fakeTransport();
    const env = { ...OPEN_ENV, MAIL_RECIPIENT_ALLOWLIST: "a@x.test" };
    const result = await sendGated({ transport, env, message: message(" A@X.test ") });
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("accepted_by_provider");
  });

  it("reports a throwing transport as failed without logging the address", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const transport = fakeTransport(
      vi.fn(async () => {
        throw new Error("boom for owner@x.test");
      }),
    );
    const result = await sendGated({ transport, env: OPEN_ENV, message: message("owner@x.test") });
    expect(result).toEqual({ status: "failed", error: "transport_threw" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("owner@x.test");
  });
});
