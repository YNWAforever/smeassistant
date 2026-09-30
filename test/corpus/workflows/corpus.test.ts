import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/lib/workspace/templates";
import { CATEGORY_MINIMUMS, cannedLlm, loadCorpus, runCorpusCase } from "./harness";

/**
 * Canned outputs prove the pipeline handles each behaviour; they do not prove
 * any model behaves. Every case runs the real run pipeline with a fake model.
 */
const corpus = loadCorpus();

describe("workflow regression corpus", () => {
  it("corpus meets category minimums", () => {
    for (const [category, minimum] of Object.entries(CATEGORY_MINIMUMS)) {
      expect(corpus.filter((c) => c.category === category).length, category).toBeGreaterThanOrEqual(minimum);
    }
  });

  it("every Live workflow with an agent has a case", () => {
    const covered = new Set(corpus.map((c) => c.workflow));
    const uncovered = TEMPLATES.filter((t) => t.capability === "Live" && t.agentKey && !covered.has(t.key)).map((t) => t.key);
    expect(uncovered).toEqual([]);
  });

  it("case ids are unique", () => {
    expect(new Set(corpus.map((c) => c.id)).size).toBe(corpus.length);
  });

  describe.each(corpus.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    it("behaves as expected", async () => {
      const { result, prompts, finishInput, llmCalls } = await runCorpusCase(c, cannedLlm(c.cannedOutputs));
      const want = c.expect;
      expect(llmCalls).toBe(want.llmCalls);
      if (want.factsNeeded) expect(result.factsNeeded).toEqual(want.factsNeeded);
      if (want.state) expect(result.state).toBe(want.state);
      if (want.version !== undefined) {
        expect(result.versionId !== undefined).toBe(want.version);
        expect(finishInput.output !== null).toBe(want.version);
      }
      const warnings = finishInput.output?.warnings ?? [];
      for (const w of want.warningsInclude ?? []) expect(warnings, `warnings include ${w}`).toContain(w);
      for (const w of want.warningsExclude ?? []) expect(warnings, `warnings exclude ${w}`).not.toContain(w);
      for (const text of want.promptIncludes ?? []) for (const p of prompts) expect(p).toContain(text);
      for (const text of want.promptExcludes ?? []) for (const p of prompts) expect(p).not.toContain(text);
    });
  });
});
