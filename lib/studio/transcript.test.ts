import { describe, expect, it } from "vitest";

import { studioTranscriptMarkdown } from "./transcript";
import type { StudioMessage } from "./types";

const CONVERSATION = { id: "c1", title: "Review replies first", createdAt: "2026-11-09T00:00:00Z", lastMessageAt: "2026-11-09T00:05:00Z" };

function message(overrides: Partial<StudioMessage>): StudioMessage {
  return { id: "m1", conversationId: "c1", seq: 1, role: "user", content: "", parts: [], intent: null, createdAt: "2026-11-09T00:00:00Z", ...overrides };
}

describe("studioTranscriptMarkdown", () => {
  it("renders readable turns, citations, artifacts and warnings without tool envelopes", () => {
    const markdown = studioTranscriptMarkdown({
      locale: "en",
      conversation: CONVERSATION,
      messages: [
        message({ content: "What should I do first?" }),
        message({
          id: "m2",
          seq: 2,
          role: "assistant",
          content: "Start with the unanswered reviews.",
          parts: [
            { kind: "citation", refs: [{ source: "document", documentVersionId: "d1", title: "Shop facts.pdf", truncated: false }] },
            { kind: "artifact", actionId: "a1", actionTitle: "Reply", artifactType: "review_reply", title: "Draft reply", body: "Thanks for visiting.", acceptanceCriteria: [], draftRunId: null, requiresApproval: true },
            { kind: "warning", code: "ai_unavailable", text: "Provider failed for one attempt." },
          ],
        }),
      ],
    });
    expect(markdown).toContain("# Review replies first");
    expect(markdown).toContain("Drafts stay drafts");
    expect(markdown).toContain("## You");
    expect(markdown).toContain("## Studio");
    expect(markdown).toContain("What should I do first?");
    expect(markdown).toContain("Start with the unanswered reviews.");
    expect(markdown).toContain("Shop facts.pdf");
    expect(markdown).toContain("Draft reply");
    expect(markdown).toContain("Thanks for visiting.");
    expect(markdown).toContain("Provider failed for one attempt.");
    expect(markdown).not.toContain('"kind"');
    expect(markdown).not.toContain('"intent"');
  });

  it("uses the localized labels and an untitled fallback", () => {
    const markdown = studioTranscriptMarkdown({
      locale: "zh-HK",
      conversation: { ...CONVERSATION, title: "" },
      messages: [message({ content: "你好" })],
    });
    expect(markdown).toContain("# 新對話");
    expect(markdown).toContain("## 你");
    expect(markdown).toContain("你好");
  });

  it("states the empty transcript honestly", () => {
    const markdown = studioTranscriptMarkdown({ locale: "en", conversation: CONVERSATION, messages: [] });
    expect(markdown).toContain("No messages in this conversation yet.");
  });
});
