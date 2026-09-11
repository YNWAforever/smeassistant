import { describe, expect, it } from "vitest";
import { isAllowedOperatorEmail, normalizeOperatorEmail } from "./operator";

describe("normalizeOperatorEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeOperatorEmail("  Ada.Wong@Fimmick.COM ")).toBe("ada.wong@fimmick.com");
  });
});

describe("isAllowedOperatorEmail", () => {
  const allowlist = "ada.wong@fimmick.com, Bo.Chan@fimmick.com";

  it("accepts a listed address regardless of case or padding", () => {
    expect(isAllowedOperatorEmail("ADA.WONG@fimmick.com", allowlist)).toBe(true);
    expect(isAllowedOperatorEmail("  bo.chan@fimmick.com  ", allowlist)).toBe(true);
  });

  it("refuses an address that is not listed", () => {
    expect(isAllowedOperatorEmail("someone@example.test", allowlist)).toBe(false);
  });

  // Fail closed: an unset or empty allowlist must grant nobody, which is also
  // the shipped default.
  it.each([
    ["undefined", undefined],
    ["empty", ""],
    ["whitespace", "   "],
    ["separators only", " , , "],
  ])("grants nobody when the allowlist is %s", (_label, list) => {
    expect(isAllowedOperatorEmail("ada.wong@fimmick.com", list)).toBe(false);
  });

  it.each([
    ["empty email", ""],
    ["whitespace email", "   "],
  ])("refuses an %s", (_label, email) => {
    expect(isAllowedOperatorEmail(email, allowlist)).toBe(false);
  });

  it("splits on commas, semicolons and whitespace", () => {
    expect(isAllowedOperatorEmail("bo.chan@fimmick.com", "ada@x.test;bo.chan@fimmick.com")).toBe(true);
    expect(isAllowedOperatorEmail("bo.chan@fimmick.com", "ada@x.test bo.chan@fimmick.com")).toBe(true);
  });
});
