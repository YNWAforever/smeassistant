import { describe, expect, it } from "vitest";
import { isAllowedStaffEmail, loadStaffIdentity, normalizeStaffEmail } from "./staff";

describe("staff identity stub", () => {
  it("never allowlists an email, even one that the legacy console would accept", () => {
    // The staff console lives in the legacy deployment; this app fails closed.
    expect(isAllowedStaffEmail("alice@fimmick.com", "alice@fimmick.com")).toBe(false);
    expect(isAllowedStaffEmail(" Alice@Fimmick.com ", "alice@fimmick.com,bob@fimmick.com")).toBe(false);
  });

  it("ignores FIMMICK_STAFF_EMAILS entirely", () => {
    const previous = process.env.FIMMICK_STAFF_EMAILS;
    process.env.FIMMICK_STAFF_EMAILS = "alice@fimmick.com";
    try {
      expect(isAllowedStaffEmail("alice@fimmick.com")).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.FIMMICK_STAFF_EMAILS;
      else process.env.FIMMICK_STAFF_EMAILS = previous;
    }
  });

  it("never resolves a staff session", async () => {
    await expect(loadStaffIdentity()).resolves.toBeNull();
  });

  it("still normalizes emails for callers that compare them", () => {
    expect(normalizeStaffEmail(" Alice@Fimmick.com ")).toBe("alice@fimmick.com");
  });
});
