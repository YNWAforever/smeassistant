import { describe, it, expect, vi } from "vitest";

const calls: string[] = [];
vi.mock("./llm", () => ({
  // llmComplete returns { text, usage } so callers can account for spend; a bare
  // string here would let the real shape drift away from the stub unnoticed.
  llmComplete: async (prompt: string) => {
    calls.push(prompt);
    return { text: "ok", usage: { inputTokens: 120, outputTokens: 40 } };
  },
}));

import { generateExecutiveSummary } from "./llm-summary";

const input = {
  business_name: "晶晶美容",
  industry: "美容",
  district: "臺北市",
  overall_score: 60,
  top_findings: [{ module: "ig", message: "x", score_impact: -5, overall_impact: -1.5 }],
};

describe("generateExecutiveSummary", () => {
  it("zh-TW prompt targets Taiwan in Mandarin (not Hong Kong/Cantonese)", async () => {
    calls.length = 0;
    await generateExecutiveSummary(input, "zh-TW");
    expect(calls[0]).toContain("台灣");
    expect(calls[0]).not.toContain("香港");
    expect(calls[0]).not.toContain("廣東話");
  });
});
