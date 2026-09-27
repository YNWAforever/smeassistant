import { describe, expect, it } from "vitest";
import { MARKETS } from "@sme-scanner/region";

import { deliveryAllowanceForTier } from "@/lib/workspace/entitlement";

import { COMMERCIAL_CONTRACT, tierAllows } from "./contract";

describe("COMMERCIAL_CONTRACT", () => {
  it("pins today's behaviour as the baseline contract", () => {
    expect(COMMERCIAL_CONTRACT.version).toBe("2026-09-baseline");
    expect(COMMERCIAL_CONTRACT.tiers.lite).toEqual({ deliveryAllowance: 3, rescans: false, seats: null });
    expect(COMMERCIAL_CONTRACT.tiers.paid).toEqual({ deliveryAllowance: null, rescans: true, seats: null });
    expect(COMMERCIAL_CONTRACT.prices.hk).toBe(MARKETS.hk.pricing); // same object, not a copy
    expect(COMMERCIAL_CONTRACT.prices.tw).toBe(MARKETS.tw.pricing);
  });
});

describe("deliveryAllowanceForTier", () => {
  it("deliveryAllowanceForTier reads the contract", () => {
    expect(deliveryAllowanceForTier("lite")).toBe(COMMERCIAL_CONTRACT.tiers.lite.deliveryAllowance);
    expect(deliveryAllowanceForTier("paid")).toBeNull();
  });
});

describe("tierAllows", () => {
  it("tierAllows fails closed", () => {
    expect(tierAllows("paid", "rescans")).toBe(true);
    expect(tierAllows("lite", "rescans")).toBe(false);
    for (const bad of [null, undefined, "", "growth", "PAID", "toString", "__proto__"]) {
      expect(tierAllows(bad, "rescans")).toBe(false);
    }
  });
});
