import { describe, expect, it } from "vitest";
import { nameVariants } from "./name-variants";

describe("nameVariants", () => {
  it("keeps names that merely end in suffix letters intact", () => {
    expect(nameVariants("Tesco")).toEqual(["Tesco"]);
    expect(nameVariants("COSCO")).toEqual(["COSCO"]);
    expect(nameVariants("Franco")).toEqual(["Franco"]);
    // "Unlimited" ends in "limited" but is not a legal suffix — must not be truncated.
    expect(nameVariants("Fitness Unlimited")).toContain("Fitness Unlimited");
    expect(nameVariants("Fitness Unlimited")).not.toContain("Fitness Un");
    expect(nameVariants("Fitness Unlimited")).not.toContain("Fitness");
  });

  it("strips a leading The as a variant", () => {
    expect(nameVariants("The Hong Kong Medical Central Club")).toContain("Hong Kong Medical Central Club");
  });

  it("strips whitespace-separated Latin legal suffixes", () => {
    expect(nameVariants("Happy Cafe Ltd")).toContain("Happy Cafe");
    expect(nameVariants("ABC Trading Company")).toContain("ABC Trading");
    expect(nameVariants("Wong Bros Co.")).toContain("Wong Bros");
  });

  it("strips 有限公司 without requiring a space", () => {
    expect(nameVariants("美心食品有限公司")).toContain("美心食品");
  });

  it("adds a no-punctuation variant", () => {
    expect(nameVariants("Happy Cafe Ltd")).toContain("HappyCafe");
  });

  it("returns empty for blank input", () => {
    expect(nameVariants("   ")).toEqual([]);
  });
});
