import { afterEach, describe, expect, it, vi } from "vitest";

import { billingAvailability } from "./availability";

const FULL_ENV = {
  COMMERCIAL_CONTRACT_APPROVED: "2026-09-baseline",
  STRIPE_SECRET_KEY: "sk_test_fixture",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture",
  STRIPE_HK_TIER_PRICE_ID: "price_hk",
  STRIPE_TW_TIER_PRICE_ID: "price_tw",
  APP_ORIGIN: "http://localhost",
};

describe("billingAvailability", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is closed with contract_unapproved on an empty env, without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(billingAvailability({})).toEqual({ open: false, reason: "contract_unapproved" });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(["", "   "])(
    "treats COMMERCIAL_CONTRACT_APPROVED=%j as unset -- contract_unapproved, no warning",
    (value) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(billingAvailability({ COMMERCIAL_CONTRACT_APPROVED: value })).toEqual({
        open: false,
        reason: "contract_unapproved",
      });
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it("warns once on a mismatched approval value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      billingAvailability({ COMMERCIAL_CONTRACT_APPROVED: "2026-08-old" }),
    ).toEqual({ open: false, reason: "contract_unapproved" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[commercial] approval_mismatch", {
      expected: "2026-09-baseline",
    });
  });

  it("is open when the approval matches after trimming and all Stripe env is set", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      billingAvailability({ ...FULL_ENV, COMMERCIAL_CONTRACT_APPROVED: " 2026-09-baseline " }),
    ).toEqual({ open: true });
    expect(warn).not.toHaveBeenCalled();
  });

  it("is provider_unconfigured when the approval matches but no Stripe env is set", () => {
    expect(
      billingAvailability({ COMMERCIAL_CONTRACT_APPROVED: "2026-09-baseline" }),
    ).toEqual({ open: false, reason: "provider_unconfigured" });
  });

  it.each([
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_HK_TIER_PRICE_ID",
    "STRIPE_TW_TIER_PRICE_ID",
    "APP_ORIGIN",
  ])(
    "is provider_unconfigured when %s is whitespace-only",
    (key) => {
      expect(
        billingAvailability({ ...FULL_ENV, [key]: "  " }),
      ).toEqual({ open: false, reason: "provider_unconfigured" });
    },
  );

  it("is open on a fully configured env", () => {
    expect(billingAvailability(FULL_ENV)).toEqual({ open: true });
  });
});
