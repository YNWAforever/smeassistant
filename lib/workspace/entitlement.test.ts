import { describe, expect, it } from "vitest";
import {
  deliveryAllowanceForTier,
  isWorkspacePaid,
  isWorkspaceTier,
  workspaceTierForStripeSubscriptionStatus,
} from "./entitlement";

describe("deliveryAllowanceForTier", () => {
  it("gives lite three approved deliveries per period and paid no cap", () => {
    expect(deliveryAllowanceForTier("lite")).toBe(3);
    expect(deliveryAllowanceForTier("paid")).toBeNull();
  });
});

describe("isWorkspaceTier", () => {
  it("accepts only the product's declared tiers", () => {
    expect(isWorkspaceTier("lite")).toBe(true);
    expect(isWorkspaceTier("paid")).toBe(true);
    expect(isWorkspaceTier("growth")).toBe(false);
    expect(isWorkspaceTier(1)).toBe(false);
    expect(isWorkspaceTier(null)).toBe(false);
  });
});

describe("isWorkspacePaid", () => {
  it("is false for the default lite tier", () => {
    expect(isWorkspacePaid("lite")).toBe(false);
  });

  it("is false for null or undefined (no workspace, or lookup failure -- fail closed)", () => {
    expect(isWorkspacePaid(null)).toBe(false);
    expect(isWorkspacePaid(undefined)).toBe(false);
  });

  it("grants paid access only to the explicit paid tier", () => {
    expect(isWorkspacePaid("paid")).toBe(true);
    expect(isWorkspacePaid("growth")).toBe(false);
    expect(isWorkspacePaid("paud")).toBe(false);
  });
});

describe("workspaceTierForStripeSubscriptionStatus", () => {
  it.each(["active", "trialing", "past_due"])("maps %s to paid", (status) => {
    expect(workspaceTierForStripeSubscriptionStatus(status)).toBe("paid");
  });

  it.each(["incomplete", "incomplete_expired", "canceled", "unpaid", "paused"])(
    "maps %s to lite",
    (status) => {
      expect(workspaceTierForStripeSubscriptionStatus(status)).toBe("lite");
    },
  );

  it("refuses to guess for missing or unknown statuses", () => {
    expect(workspaceTierForStripeSubscriptionStatus(undefined)).toBeNull();
    expect(workspaceTierForStripeSubscriptionStatus("future_status")).toBeNull();
  });
});
