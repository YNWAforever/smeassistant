import { describe, expect, it } from "vitest";
import { reportVisibility } from "./visibility";

describe("report visibility boundary", () => {
  it("keeps legacy unlocked rows in preview without a viewer grant", () => {
    // The legacy unlocked flag is intentionally not part of this decision.
    expect(reportVisibility({ kind: "public" })).toBe("preview");
  });

  it("reveals the full report only for a valid viewer or staff decision", () => {
    expect(reportVisibility({ kind: "viewer", grantId: "grant-1" })).toBe("full");
    expect(reportVisibility({ kind: "staff", userId: "staff-1", email: "staff@fimmick.com" })).toBe("full");
  });
});