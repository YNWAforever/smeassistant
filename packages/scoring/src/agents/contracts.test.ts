import { describe, expect, it } from "vitest";
import { validateAgentDraftOutput } from "./contracts";

describe("validateAgentDraftOutput", () => {
  describe("review_reply_agent", () => {
    const valid = {
      reviewExcerpt: "Food was cold and service was slow.",
      reviewRating: 2,
      reviewLanguage: "en",
      draftReply: "We're sorry to hear about your experience...",
    };

    it("accepts a fully-shaped draft", () => {
      const result = validateAgentDraftOutput("review_reply_agent", valid);
      expect(result).toEqual({ agentKey: "review_reply_agent", ...valid });
    });

    it("rejects a missing draftReply", () => {
      const { draftReply, ...rest } = valid;
      expect(validateAgentDraftOutput("review_reply_agent", rest)).toBeNull();
    });

    it("rejects an empty-string draftReply", () => {
      expect(validateAgentDraftOutput("review_reply_agent", { ...valid, draftReply: "   " })).toBeNull();
    });

    it("rejects a non-numeric reviewRating", () => {
      expect(validateAgentDraftOutput("review_reply_agent", { ...valid, reviewRating: "5" })).toBeNull();
    });

    it("rejects gbp_post_agent-shaped input", () => {
      expect(validateAgentDraftOutput("review_reply_agent", {
        draftPostZh: "x", draftPostEn: "x", seedEvidence: [],
      })).toBeNull();
    });
  });

  describe("gbp_post_agent", () => {
    const valid = {
      draftPostZh: "本店呢個星期推出新優惠！",
      draftPostEn: "New offer this week!",
      seedEvidence: ["recent_posts_count: 0"],
    };

    it("accepts a fully-shaped draft", () => {
      const result = validateAgentDraftOutput("gbp_post_agent", valid);
      expect(result).toEqual({ agentKey: "gbp_post_agent", ...valid });
    });

    it("rejects a missing draftPostZh", () => {
      const { draftPostZh, ...rest } = valid;
      expect(validateAgentDraftOutput("gbp_post_agent", rest)).toBeNull();
    });

    it("rejects a non-array seedEvidence", () => {
      expect(validateAgentDraftOutput("gbp_post_agent", { ...valid, seedEvidence: "none" })).toBeNull();
    });

    it("rejects a seedEvidence array with a non-string element", () => {
      expect(validateAgentDraftOutput("gbp_post_agent", { ...valid, seedEvidence: [1, 2] })).toBeNull();
    });
  });

  it("rejects null", () => {
    expect(validateAgentDraftOutput("review_reply_agent", null)).toBeNull();
  });

  it("rejects a non-object", () => {
    expect(validateAgentDraftOutput("review_reply_agent", "a string")).toBeNull();
  });

  it("rejects an agentKey this contract set doesn't cover", () => {
    expect(validateAgentDraftOutput("aeo_content_agent", { anything: true })).toBeNull();
  });
});
