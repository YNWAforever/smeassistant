import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/lib/workspace/templates";
import { CATEGORY_MINIMUMS, cannedLlm, loadCorpus, parseCorpusCase, runCorpusCase } from "./harness";

/**
 * Canned outputs prove the pipeline handles each behaviour; they do not prove
 * any model behaves. Every case runs the real run pipeline with a fake model.
 *
 * P4.1 offer cases have no injection case on purpose: offer details are typed
 * and confirmed by the owner, so confirmedText deliberately trusts them, and a
 * link or claim there is the owner's own. Untrusted text (reviews, scraped
 * pages) never reaches an offer prompt.
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

  it("a malformed or schema-invalid case file throws an error naming the file", () => {
    expect(() => parseCorpusCase("broken-01.json", "{ not json")).toThrow(/Invalid corpus case broken-01\.json: /);
    expect(() => parseCorpusCase("wrong-02.json", JSON.stringify({ id: "x" }))).toThrow(/Invalid corpus case wrong-02\.json: /);
    const valid = corpus[0];
    expect(parseCorpusCase("ok.json", JSON.stringify(valid))).toEqual(valid);
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
      if (want.reason) expect(finishInput.reason).toBe(want.reason);
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
