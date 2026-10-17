import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/lib/workspace/templates";
import { AGENTS, parseAgentOutput, type AgentContext } from "@/lib/agents";
import { overview } from "@/lib/assistant/__fixtures__";
import { scopeReviewReplyFacts } from "@/lib/agents/draft-grounding";
import { CATEGORY_MINIMUMS, cannedLlm, loadCorpus, parseCorpusCase, runCorpusCase } from "./harness";

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

  it("every Live workflow with an agent, and both offer workflows, has a case", () => {
    const covered = new Set(corpus.map((c) => c.workflow));
    const uncovered = TEMPLATES.filter(
      (t) => ((t.capability === "Live" && t.agentKey) || t.key.startsWith("offer-")) && !covered.has(t.key),
    ).map((t) => t.key);
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
      if (want.reason === "unconfirmed_business_fact") {
        expect(finishInput.output).toBeNull();
        expect(result.versionId).toBeUndefined();
        expect(result.error).toMatch(/\S/);
      }
      if (want.version !== undefined) {
        expect(result.versionId !== undefined).toBe(want.version);
        if (want.version) expect(finishInput.output).not.toBeNull();
        else if (finishInput.output) {
          // A valid model response can request facts without creating an artifact version.
          expect(finishInput.output.body).toBe("");
          expect(finishInput.output.facts_needed.length).toBeGreaterThan(0);
        }
      }
      let warnings = finishInput.output?.warnings ?? [];
      if (!finishInput.output && want.reason === "unconfirmed_business_fact" && want.warningsInclude?.length) {
        // Withheld content is deliberately absent from persistence. Keep proving
        // the rejected completion triggers its original guardrail assertions.
        const text = c.cannedOutputs[llmCalls - 1];
        const rejected = parseAgentOutput(typeof text === "string" ? text : undefined, AGENTS.review_reply.outputSchema);
        expect(rejected).not.toBeNull();
        const ctx: AgentContext = scopeReviewReplyFacts({
          locale: c.locale,
          market: c.market,
          brand: { voice: "warm", approvedClaims: c.brand?.approvedClaims ?? [], prohibitedTerms: c.brand?.prohibitedTerms ?? [], languages: [], facts: c.brand?.facts ?? {} },
          location: { name: "Corpus Cafe" },
          action: { ...overview(), location: { id: "loc-corpus", slug: "corpus", name: { en: "Corpus Cafe", "zh-HK": "Corpus Cafe", "zh-TW": "Corpus Cafe" } } },
          evidence: {},
          providedInputs: c.provided,
          sampledReviews: (c.reviews ?? []).filter(review => !review.owner_response),
        }, false);
        warnings = [...rejected!.warnings, ...AGENTS.review_reply.acceptance(ctx, rejected!)];
      }
      for (const w of want.warningsInclude ?? []) expect(warnings, `warnings include ${w}`).toContain(w);
      for (const w of want.warningsExclude ?? []) expect(warnings, `warnings exclude ${w}`).not.toContain(w);
      for (const text of want.promptIncludes ?? []) for (const p of prompts) expect(p).toContain(text);
      for (const text of want.promptExcludes ?? []) for (const p of prompts) expect(p).not.toContain(text);
    });
  });
});
