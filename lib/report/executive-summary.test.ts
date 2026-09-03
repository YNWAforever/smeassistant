import { describe, expect, it, vi } from "vitest";
import { cachedSummaryFor, resolveExecutiveSummary, type ExecutiveSummarySource } from "./executive-summary";

/**
 * The regression this guards: commit 6c264ba removed all three
 * generateExecutiveSummary call sites while leaving summary_zh/_en/_tw selected
 * and rendered, so every English and Taiwan full report silently fell through to
 * the template for twelve days. No test noticed, because nothing asserted the
 * summary was ever produced.
 */

function source(overrides: Partial<ExecutiveSummarySource> = {}): ExecutiveSummarySource {
  return {
    jobId: "job-1",
    businessName: "Demo Coffee",
    industry: "餐飲",
    district: "Central",
    overallScore: 62,
    cached: { summary_zh: null, summary_en: null, summary_tw: null },
    findings: [
      { module: "gbp", owner_message_zh: "評語太少", score_impact: -25 },
      { module: "ig", owner_message_zh: "冇 CTA", score_impact: -10 },
    ],
    ...overrides,
  };
}

function deps(generated: string | null = "A generated summary.") {
  return {
    configured: vi.fn().mockReturnValue(true),
    generate: vi.fn().mockResolvedValue(generated),
    cache: vi.fn(),
  };
}

describe("resolveExecutiveSummary", () => {
  it("generates and caches on first view of an English report", async () => {
    const d = deps();
    const result = await resolveExecutiveSummary(source(), "en", d);
    expect(result).toBe("A generated summary.");
    expect(d.generate).toHaveBeenCalledOnce();
    expect(d.cache).toHaveBeenCalledWith("job-1", "summary_en", "A generated summary.");
  });

  it("caches Taiwan summaries into their own column", async () => {
    const d = deps();
    await resolveExecutiveSummary(source(), "zh-TW", d);
    expect(d.cache).toHaveBeenCalledWith("job-1", "summary_tw", "A generated summary.");
  });

  it("generates and caches zh-HK summaries into the base column", async () => {
    const d = deps();
    const result = await resolveExecutiveSummary(source(), "zh-HK", d);
    expect(result).toBe("A generated summary.");
    expect(d.generate).toHaveBeenCalledOnce();
    expect(d.generate.mock.calls[0]![1]).toBe("zh-HK");
    expect(d.cache).toHaveBeenCalledWith("job-1", "summary_zh", "A generated summary.");
  });

  it("passes at most the five most damaging findings", async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      module: "gbp",
      owner_message_zh: `finding ${i}`,
      score_impact: -i,
    }));
    const d = deps();
    await resolveExecutiveSummary(source({ findings: many }), "en", d);
    expect(d.generate.mock.calls[0]![0].top_findings).toHaveLength(5);
  });

  it("converts each finding's module-relative score_impact into its weighted effect on the headline", async () => {
    // score_impact is module-relative (subtracts from that module's own 0-100
    // score). The headline is a weighted average (WEIGHTS.ig = .30), so a -20
    // on ig only costs the headline -20 * 0.30 = -6, not -20. The model must
    // receive both numbers so it never reports the module-relative figure as
    // the headline delta.
    const d = deps();
    await resolveExecutiveSummary(
      source({ findings: [{ module: "ig", owner_message_zh: "冇 CTA", score_impact: -20 }] }),
      "en",
      d,
    );
    const topFindings = d.generate.mock.calls[0]![0].top_findings;
    expect(topFindings[0].score_impact).toBe(-20);
    expect(topFindings[0].overall_impact).toBeCloseTo(-6, 5);
  });

  it("returns the cached value without calling the model again", async () => {
    const d = deps();
    const cached = { summary_zh: null, summary_en: "Already stored.", summary_tw: null };
    const result = await resolveExecutiveSummary(source({ cached }), "en", d);
    expect(result).toBe("Already stored.");
    expect(d.generate).not.toHaveBeenCalled();
    expect(d.cache).not.toHaveBeenCalled();
  });

  it("does not summarise a report whose score could not be computed", async () => {
    // A narrative about a withheld composite would be fabrication — the same rule
    // the coverage-aware scorer is built on.
    const d = deps();
    const result = await resolveExecutiveSummary(source({ overallScore: null }), "en", d);
    expect(result).toBeNull();
    expect(d.generate).not.toHaveBeenCalled();
  });

  it("skips generation entirely when no LLM is configured", async () => {
    const d = { ...deps(), configured: vi.fn().mockReturnValue(false) };
    const result = await resolveExecutiveSummary(source(), "en", d);
    expect(result).toBeNull();
    expect(d.generate).not.toHaveBeenCalled();
  });

  it("falls back to the template when the model fails, and caches nothing", async () => {
    // llmComplete returns null on timeout, bad key, or malformed response. The
    // report must still render.
    const d = deps(null);
    const result = await resolveExecutiveSummary(source(), "en", d);
    expect(result).toBeNull();
    expect(d.cache).not.toHaveBeenCalled();
  });
});

describe("cachedSummaryFor", () => {
  it("falls back from a locale column to the zh base", () => {
    const cached = { summary_zh: "base", summary_en: null, summary_tw: null };
    expect(cachedSummaryFor(cached, "en")).toBe("base");
    expect(cachedSummaryFor(cached, "zh-TW")).toBe("base");
    expect(cachedSummaryFor(cached, "zh-HK")).toBe("base");
  });

  it("prefers the locale column over the zh base", () => {
    const cached = { summary_zh: "base", summary_en: "english", summary_tw: "taiwan" };
    expect(cachedSummaryFor(cached, "en")).toBe("english");
    expect(cachedSummaryFor(cached, "zh-TW")).toBe("taiwan");
  });
});
