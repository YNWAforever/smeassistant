import { describe, expect, it } from "vitest";
import { nextStepText, problemReasonLabel, problemTitle, KNOWN_REASON_CODES } from "./problem-copy";
import type { OwnerProblem } from "./failure-types";

const LOCALES = ["en", "zh-HK", "zh-TW"] as const;

function problem(partial: Partial<OwnerProblem>): OwnerProblem {
  return {
    kind: "scan_failed", id: "id", reference: "SCAN-ABCDEF", correlationId: null, occurredAt: "2026-09-25T00:00:00.000Z",
    workspace: null, locationId: null, actionId: null, businessName: "Kam Man House", reason: "COLLECTION_FAILED",
    attempts: null, operatorAction: "none", ownerAction: "none", contactHref: null, ...partial,
  };
}

describe("problem copy", () => {
  it("labels every known reason code in every locale, never echoing the code", () => {
    for (const locale of LOCALES)
      for (const code of KNOWN_REASON_CODES) {
        const label = problemReasonLabel(locale, code);
        expect(label).not.toBe(code);
        expect(label).not.toContain("problems.");
      }
  });

  it("falls back to the generic line for an unknown or unsafe code", () => {
    for (const code of ["WEIRD_NEW_CODE", "kind.scan_failed", "../reason", ""]) {
      expect(problemReasonLabel("en", code)).toBe("Something went wrong.");
    }
  });

  it("titles each owner-visible kind", () => {
    expect(problemTitle("en", "google_connection")).toBe("The Google connection needs attention");
    expect(problemTitle("zh-HK", "scan_failed")).toBe("一次掃描未能完成");
  });

  it("uses the dead-letter line for a stuck scan whatever the action", () => {
    expect(nextStepText("en", problem({ kind: "scan_dead_lettered", ownerAction: "none" }))).toBe("It closes automatically within 24 hours; you can then rescan.");
    expect(nextStepText("en", problem({ ownerAction: "rescan" }))).toBe("Run a new scan for this location.");
    expect(nextStepText("en", problem({ ownerAction: "none" }))).toBe("An owner, or a manager for this location, can act on this.");
  });
});
