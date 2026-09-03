import { describe, expect, it } from "vitest";
import { localized } from "@/lib/domain";
import type { ActionOverview } from "@/lib/workspace/overview";
import { AGENTS, AGENT_LLM_OPTIONS, GUARDRAILS, isAgentKey, parseAgentOutput, type AgentContext } from "./index";
import { computeCostUsd } from "./cost-model";

const action: ActionOverview = {
  id: "act-1",
  templateKey: "review-response",
  capability: "Live",
  location: { id: "loc-1", slug: "yik-yam", name: localized("Yik Yam", "益欣") },
  title: localized("Reply to unanswered Google reviews", "回覆未回覆的 Google 評論"),
  summary: localized("Drafts follow your brand voice.", "草稿按品牌語氣。"),
  evidence: { factType: "Observed", source: "Google Business Profile", value: "18%", detail: localized("Response rate fell from 31% to 18%", "回覆率由 31% 降至 18%"), observedAt: "2026-09-01T10:00:00Z", freshness: localized("Updated 2 days ago", "2 日前更新") },
  priority: "high",
  priorityFactors: [],
  effortMinutes: 10,
  requiredInputs: ["brand_voice", "reviews_without_response", "language"],
  missingInputs: [],
  actionState: "recommended",
  runState: "queued",
  approvalState: "draft",
  deliveryState: "not_requested",
  measurementState: "not_eligible",
  displayPhase: localized("Recommended", "建議"),
  displayPhaseKey: "recommended",
  createdAt: "2026-09-01T10:00:00Z",
  updatedAt: "2026-09-01T10:00:00Z",
};

/** One fixed context for every agent so the snapshots differ only by agent. */
export const fixedCtx: AgentContext = {
  locale: "zh-HK",
  market: "hk",
  brand: {
    voice: "warm, direct",
    approvedClaims: ["Family-run since 2009", "Cantonese roast meats made in-house"],
    prohibitedTerms: ["best in Hong Kong", "Michelin"],
    languages: ["zh-HK", "en"],
    facts: { opening_hours: "11:00–21:00 daily", booking: "WhatsApp 5555 0000" },
  },
  location: { name: "Kam Man House — Yik Yam", address: "12 Example Street", district: "Yau Ma Tei" },
  action,
  evidence: {
    snapshot: { observed_at: "2026-09-01T10:00:00Z", overall_score: 62, coverage: 0.78, metrics: { "gbp.response_rate_pct": 18, "gbp.rating": 4.2 } },
  },
  providedInputs: { brand_voice: "warm, direct", language: "zh-HK", channel: "WhatsApp", approved_claim: "Family-run since 2009", cta_link: "wa.me/55550000", owner_fact_1: "Private room seats 12", menu_items: "叉燒飯, 燒鵝瀨" },
  sampledReviews: [
    { rating: 2, text: "Waited 40 minutes for roast goose, staff were friendly though.", time: "2026-08-30T00:00:00Z" },
    { rating: 5, text: "Best char siu in the area.", time: "2026-08-20T00:00:00Z" },
  ],
};

describe("AGENTS", () => {
  it("registers the seven Live and four Beta agents", () => {
    const live = Object.values(AGENTS).filter((a) => a.capability === "Live").map((a) => a.key).sort();
    const beta = Object.values(AGENTS).filter((a) => a.capability === "Beta").map((a) => a.key).sort();
    expect(live).toEqual(["faq_jsonld", "ig_bio", "review_reply", "review_request", "social_post", "validation_plan", "website_basics"]);
    expect(beta).toEqual(["gbp_post", "local_seo_brief", "menu_translation", "photo_brief"]);
    expect(isAgentKey("review_reply")).toBe(true);
    expect(isAgentKey("review_reply_agent")).toBe(false);
    expect(AGENT_LLM_OPTIONS).toEqual({ jsonMode: true, temperature: 0.4, maxTokens: 1200, timeoutMs: 45_000 });
  });

  for (const agent of Object.values(AGENTS)) {
    it(`${agent.key} prompt matches its snapshot and carries the shared guardrails`, () => {
      const prompt = agent.buildPrompt(fixedCtx);
      for (const rule of GUARDRAILS) expect(prompt).toContain(rule);
      expect(prompt).toContain("Cantonese");
      expect(prompt).toContain("Hong Kong");
      expect(prompt).toContain('"facts_needed": string[]');
      expect(prompt).toContain(`${agent.key}@${agent.promptVersion}`);
      expect(prompt).toMatchSnapshot();
    });
  }

  it("switches the language line per locale", () => {
    expect(AGENTS.ig_bio.buildPrompt({ ...fixedCtx, locale: "zh-TW", market: "tw" })).toContain("Taiwan Mandarin");
    expect(AGENTS.ig_bio.buildPrompt({ ...fixedCtx, locale: "en" })).toContain("plain English");
  });
});

describe("acceptance", () => {
  const base = { title: "t", acceptance_criteria: [], warnings: [], facts_used: [], facts_needed: [] };
  it("flags prohibited terms and compensation promises in review replies", () => {
    const warnings = AGENTS.review_reply.acceptance(fixedCtx, { ...base, body: "We are the best in Hong Kong and will refund your meal." });
    expect(warnings).toEqual(["prohibited_term:best in Hong Kong", "compensation_promise"]);
  });
  it("flags an over-long bio and a missing social alt text", () => {
    expect(AGENTS.ig_bio.acceptance(fixedCtx, { ...base, body: "x".repeat(151) })).toEqual(["bio_over_150_chars"]);
    expect(AGENTS.social_post.acceptance(fixedCtx, { ...base, body: "hello" })).toEqual(["alt_text_missing"]);
    expect(AGENTS.social_post.acceptance({ ...fixedCtx, providedInputs: { text_only: true } }, { ...base, body: "hello" })).toEqual([]);
  });
});

describe("parseAgentOutput", () => {
  it("accepts fenced JSON and fills missing lists", () => {
    const out = parseAgentOutput('```json\n{"title":"Hi","body":"Thanks","facts_used":["voice"]}\n```');
    expect(out).toEqual({ title: "Hi", body: "Thanks", alt_text: undefined, acceptance_criteria: [], warnings: [], facts_used: ["voice"], facts_needed: [] });
  });
  it("accepts prose around the object and facts_needed without a body", () => {
    expect(parseAgentOutput('Sure: {"title":"","body":"","facts_needed":["menu_items"]} done')?.facts_needed).toEqual(["menu_items"]);
  });
  it("rejects non-JSON, empty output and an empty body with nothing needed", () => {
    expect(parseAgentOutput("not json")).toBeNull();
    expect(parseAgentOutput(null)).toBeNull();
    expect(parseAgentOutput('{"title":"x","body":""}')).toBeNull();
  });
});

describe("computeCostUsd", () => {
  it("prices complete usage and returns null when a count is missing", () => {
    expect(computeCostUsd({ inputTokens: 1000, outputTokens: 1000 })).toBe(0.001);
    expect(computeCostUsd({ inputTokens: 10, outputTokens: null })).toBeNull();
  });
});
