import { beforeEach, describe, expect, it, vi } from "vitest";

const sendViaResend = vi.hoisted(() => vi.fn());
vi.mock("./resend-driver", () => ({ sendViaResend }));

import { createMailTransport, MAIL_SEND_STATUSES } from "./transport";

beforeEach(() => vi.resetAllMocks());

const MESSAGE = { to: "owner@example.test", subject: "Hi", text: "body", dedupeKey: "k1" };

describe("MAIL_SEND_STATUSES", () => {
  it("names all four states and never claims the word 'sent'", () => {
    expect(MAIL_SEND_STATUSES).toEqual(["not_configured", "queued", "accepted_by_provider", "failed"]);
    expect(MAIL_SEND_STATUSES.some((status) => status.includes("sent"))).toBe(false);
  });
});

describe("createMailTransport", () => {
  it("reports not_configured without calling the provider when either variable is blank", async () => {
    const envs = [
      {},
      { RESEND_API_KEY: "key" },
      { REPORT_EMAIL_FROM: "from@example.test" },
      { RESEND_API_KEY: "   ", REPORT_EMAIL_FROM: "from@example.test" },
    ];
    for (const env of envs) {
      expect(await createMailTransport(env).send(MESSAGE)).toEqual({ status: "not_configured" });
    }
    expect(sendViaResend).not.toHaveBeenCalled();
  });

  it("delegates to the Resend driver with the configured key and from address once both are set", async () => {
    sendViaResend.mockResolvedValue({ status: "accepted_by_provider", providerMessageId: "msg-1" });
    const result = await createMailTransport({
      RESEND_API_KEY: "key-1",
      REPORT_EMAIL_FROM: "owner@fimmick.com",
    }).send(MESSAGE);
    expect(result).toEqual({ status: "accepted_by_provider", providerMessageId: "msg-1" });
    expect(sendViaResend).toHaveBeenCalledWith({ apiKey: "key-1", from: "owner@fimmick.com" }, MESSAGE);
  });

  it("defaults to process.env when no env is supplied", async () => {
    const previousKey = process.env.RESEND_API_KEY;
    const previousFrom = process.env.REPORT_EMAIL_FROM;
    delete process.env.RESEND_API_KEY;
    delete process.env.REPORT_EMAIL_FROM;
    try {
      expect(await createMailTransport().send(MESSAGE)).toEqual({ status: "not_configured" });
    } finally {
      if (previousKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousKey;
      if (previousFrom === undefined) delete process.env.REPORT_EMAIL_FROM;
      else process.env.REPORT_EMAIL_FROM = previousFrom;
    }
  });
});
