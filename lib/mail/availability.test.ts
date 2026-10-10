import { afterEach, describe, expect, it, vi } from "vitest";

import { MAIL_TEMPLATES_VERSION, mailAvailability, parseRecipientAllowlist } from "./availability";

const VALID_SECRET = "a".repeat(32);

const FULL_ENV = {
  APPLICATION_MAIL_APPROVED: MAIL_TEMPLATES_VERSION,
  RESEND_API_KEY: "re_fixture",
  REPORT_EMAIL_FROM: "notify@example.com",
  APP_ORIGIN: "http://localhost",
  MAIL_UNSUBSCRIBE_SECRET: VALID_SECRET,
};

describe("mailAvailability", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is closed with mail_unapproved on an empty env, without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(mailAvailability({})).toEqual({ open: false, reason: "mail_unapproved" });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(["", "   "])(
    "treats APPLICATION_MAIL_APPROVED=%j as unset -- mail_unapproved, no warning",
    (value) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(mailAvailability({ APPLICATION_MAIL_APPROVED: value })).toEqual({
        open: false,
        reason: "mail_unapproved",
      });
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it("treats the previous template version as unapproved", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(MAIL_TEMPLATES_VERSION).toBe("2026-10-mail-v2");
    expect(mailAvailability({ ...FULL_ENV, APPLICATION_MAIL_APPROVED: "2026-09-event-mail-v1" })).toEqual({
      open: false,
      reason: "mail_unapproved",
    });
  });

  it("warns once on a mismatched approval value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(mailAvailability({ APPLICATION_MAIL_APPROVED: "2026-08-old" })).toEqual({
      open: false,
      reason: "mail_unapproved",
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[mail] approval_mismatch", {
      expected: MAIL_TEMPLATES_VERSION,
    });
  });

  it("is provider_unconfigured when the approval matches but no provider env is set", () => {
    expect(mailAvailability({ APPLICATION_MAIL_APPROVED: MAIL_TEMPLATES_VERSION })).toEqual({
      open: false,
      reason: "provider_unconfigured",
    });
  });

  it.each(["RESEND_API_KEY", "REPORT_EMAIL_FROM", "APP_ORIGIN"])(
    "is provider_unconfigured when %s is whitespace-only",
    (key) => {
      expect(mailAvailability({ ...FULL_ENV, [key]: "  " })).toEqual({
        open: false,
        reason: "provider_unconfigured",
      });
    },
  );

  it.each(["localhost:3000", "app.example.com:443", "ftp://x.test", "not a url"])(
    "is provider_unconfigured when APP_ORIGIN=%j is not an http(s) origin",
    (origin) => {
      expect(mailAvailability({ ...FULL_ENV, APP_ORIGIN: origin })).toEqual({
        open: false,
        reason: "provider_unconfigured",
      });
    },
  );

  it("is open when APP_ORIGIN is an https URL with a trailing slash", () => {
    expect(mailAvailability({ ...FULL_ENV, APP_ORIGIN: "https://app.example.test/" })).toEqual({
      open: true,
    });
  });

  it("is provider_unconfigured when the unsubscribe secret is 31 bytes", () => {
    expect(
      mailAvailability({ ...FULL_ENV, MAIL_UNSUBSCRIBE_SECRET: "a".repeat(31) }),
    ).toEqual({ open: false, reason: "provider_unconfigured" });
  });

  it("is open when the unsubscribe secret is exactly 32 bytes and everything else is set", () => {
    expect(mailAvailability({ ...FULL_ENV, MAIL_UNSUBSCRIBE_SECRET: "a".repeat(32) })).toEqual({
      open: true,
    });
  });

  it("is open when the approval matches after trimming and all provider env is set", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      mailAvailability({ ...FULL_ENV, APPLICATION_MAIL_APPROVED: ` ${MAIL_TEMPLATES_VERSION} ` }),
    ).toEqual({ open: true });
    expect(warn).not.toHaveBeenCalled();
  });

  it("is open on a fully configured env", () => {
    expect(mailAvailability(FULL_ENV)).toEqual({ open: true });
  });
});

describe("parseRecipientAllowlist", () => {
  it.each([undefined, "", " , ,"])("treats %j as unset -- null", (value) => {
    expect(parseRecipientAllowlist(value)).toBeNull();
  });

  it("lower-cases and trims entries, dropping blanks", () => {
    expect(parseRecipientAllowlist(" Owner@Example.com , ,x@y.hk")).toEqual(
      new Set(["owner@example.com", "x@y.hk"]),
    );
  });
});
