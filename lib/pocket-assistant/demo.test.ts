import { afterEach, describe, expect, it, vi } from "vitest";
import { demoQuestionIds } from "./contracts";
import { createDemoAssistantRun } from "./demo";

/**
 * Phase 5 guard: the demo pages must render exactly what they rendered before
 * the live route existed. Every intent x locale is snapshotted with a fixed
 * run id (the only non-deterministic field).
 */
const LOCALES = ["zh-HK", "zh-TW", "en"] as const;

afterEach(() => vi.restoreAllMocks());

describe("createDemoAssistantRun", () => {
  for (const locale of LOCALES) {
    for (const questionId of demoQuestionIds) {
      it(`${questionId} / ${locale}`, () => {
        vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000000");
        const run = createDemoAssistantRun(questionId, locale);
        expect(run.runId).toBe("demo_run_00000000-0000-4000-8000-000000000000");
        expect(run.answer.length).toBeGreaterThan(0);
        expect(run.requiresApproval).toBe(Boolean(run.output));
        expect(run).toMatchSnapshot();
      });
    }
  }

  for (const locale of ["zh-HK", "en"] as const) {
    it(`the contextual intents answer inside a workspace only, with no nextStep / ${locale}`, () => {
      for (const questionId of ["explain_missing_inputs", "where_to_continue"] as const) {
        const run = createDemoAssistantRun(questionId, locale);
        expect(run.answer.length).toBeGreaterThan(0);
        expect(run.nextStep).toBeUndefined();
        expect(run.evidenceRefs).toEqual([]);
        expect(run.output).toBeUndefined();
        expect(run.nextAction).toBe(locale === "en" ? "Sign in to your workspace and ask again." : "登入你的工作台後再問一次。");
      }
    });
  }

  it("keeps the generic English next action for every other intent (T1-a)", () => {
    for (const questionId of demoQuestionIds.filter((id) => id !== "explain_missing_inputs" && id !== "where_to_continue")) {
      expect(createDemoAssistantRun(questionId, "en").nextAction).toBe("Review the evidence and keep owner approval as the next control point.");
    }
  });
});
