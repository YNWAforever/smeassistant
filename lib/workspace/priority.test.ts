import { describe, expect, it } from "vitest";
import { priorityFromScore, scorePriority, type PriorityInput } from "./priority";

const base: PriorityInput = {
  scoreImpact: -12,
  module: "gbp",
  severity: "warning",
  regressed: false,
  evidenceAgeDays: 20,
  inputsAvailable: false,
  hasDraft: false,
  effortMinutes: 10,
  externalFacing: true,
  brandProfileExists: true,
  moduleConfidence: "high",
  moduleMeasured: true,
};

describe("scorePriority", () => {
  it("is deterministic and persists every factor", () => {
    const a = scorePriority(base);
    const b = scorePriority({ ...base });
    expect(a).toEqual(b);
    expect(a.factors.map((f) => f.key)).toEqual(["impact", "severity", "urgency", "readiness", "effort", "risk", "evidence"]);
    expect(a.score).toBeCloseTo(a.factors.reduce((sum, f) => sum + f.points, 0), 5);
  });

  it("applies the 3.6.3 factor rules", () => {
    const factor = (input: Partial<PriorityInput>, key: string) => scorePriority({ ...base, ...input }).factors.find((f) => f.key === key)!.points;
    expect(factor({ scoreImpact: -100 }, "impact")).toBe(40);
    expect(factor({ severity: "critical" }, "severity")).toBe(15);
    expect(factor({ severity: "info" }, "severity")).toBe(2);
    expect(factor({ regressed: true }, "urgency")).toBe(15);
    expect(factor({ evidenceAgeDays: 3 }, "urgency")).toBe(8);
    expect(factor({ evidenceAgeDays: null }, "urgency")).toBe(0);
    expect(factor({ inputsAvailable: true, hasDraft: true }, "readiness")).toBe(15);
    expect(factor({ effortMinutes: 60 }, "effort")).toBe(-10);
    expect(factor({ effortMinutes: 6 }, "effort")).toBe(-2);
    expect(factor({ brandProfileExists: false }, "risk")).toBe(-5);
    expect(factor({ externalFacing: false, brandProfileExists: false }, "risk")).toBe(0);
    expect(factor({ moduleConfidence: "medium" }, "evidence")).toBe(5);
    expect(factor({ moduleMeasured: false }, "evidence")).toBe(-10);
  });

  it("buckets scores into the four priorities", () => {
    expect(priorityFromScore(60)).toBe("urgent");
    expect(priorityFromScore(59.9)).toBe("high");
    expect(priorityFromScore(40)).toBe("high");
    expect(priorityFromScore(20)).toBe("medium");
    expect(priorityFromScore(19)).toBe("low");
  });
});
