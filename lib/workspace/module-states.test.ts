import { describe, expect, it } from "vitest";
import { deriveModuleStates, measuredPrimarySources, websiteState } from "./module-states";

const checks = { evaluated: 15, passed: 12, results: [] };

describe("deriveModuleStates", () => {
  it("maps engine module_results onto the four display sources", () => {
    const states = deriveModuleStates(
      {
        status: "done",
        module_results: {
          ig: { status: "unavailable", score: null, confidence: "none", limitationCode: "IG_HANDLE_NOT_PROVIDED" },
          gbp: { status: "measured", score: 71, confidence: "high", limitationCode: null },
          aeo: { status: "measured", score: 40, confidence: "medium", limitationCode: null },
          trust: { status: "measured", score: 55, confidence: "low", limitationCode: null },
        },
        module_scores: null,
      },
      checks,
      true,
    );
    // IG unavailable is excluded: neither measured nor scored (guardrail 2).
    expect(states.instagram).toEqual({ status: "unavailable", score: null, confidence: "none", limitationCode: "IG_HANDLE_NOT_PROVIDED" });
    expect(states.google_business.status).toBe("measured");
    expect(states.google_business.score).toBe(71);
    expect(states.search_ai.confidence).toBe("medium");
    expect(states.website).toEqual({ status: "measured", score: null, confidence: "high", limitationCode: null });
    expect(measuredPrimarySources(states)).toEqual({ measured: 3, total: 4 });
  });

  it("falls back to legacy module_scores as measured / low, like load-report", () => {
    const states = deriveModuleStates({ status: "done", module_results: null, module_scores: { gbp: { score: 60 } } }, null, false);
    expect(states.google_business).toEqual({ status: "measured", score: 60, confidence: "low", limitationCode: null });
    expect(states.instagram).toEqual({ status: "unavailable", score: null, confidence: "none", limitationCode: "IG_NOT_MEASURED" });
  });

  it("reports pending only while the job is non-terminal", () => {
    const running = deriveModuleStates({ status: "collecting", module_results: null, module_scores: null }, null, false);
    expect(running.google_business.status).toBe("pending");
    const failed = deriveModuleStates({ status: "failed", module_results: null, module_scores: null }, null, false);
    expect(failed.google_business.status).toBe("unavailable");
  });

  it("derives the website state from checks and url presence", () => {
    expect(websiteState(null, false).status).toBe("unsupported");
    expect(websiteState({ evaluated: 0, passed: 0, results: [] }, true)).toMatchObject({ status: "unavailable", limitationCode: "WEBSITE_UNREACHABLE" });
    expect(websiteState(checks, true).status).toBe("measured");
  });

  it("never synthesises a composite when the overall score is withheld", () => {
    // A withheld overall (null) stays withheld: the workspace shows module
    // states and coverage, never a composite of its own (guardrail 3).
    const states = deriveModuleStates(
      { status: "partial", module_results: { gbp: { status: "measured", score: 71, confidence: "high", limitationCode: null } }, module_scores: null },
      null,
      false,
    );
    expect(Object.values(states).filter((s) => s.status === "measured")).toHaveLength(1);
    expect("overall" in states).toBe(false);
  });
});
