import { describe, expect, it } from "vitest";
import { parseVersionMeta } from "./version-meta";

describe("parseVersionMeta", () => {
  it("classifies every guardrail code the agents actually emit", () => {
    // The vocabulary comes from lib/agents/guardrails.ts and lib/agents/agents/*.
    // If an agent gains a code, it must land in guardrails or agentNotes -- never
    // be dropped, which is how these went unseen in the first place.
    const meta = {
      warnings: [
        "prohibited_term:best in town",
        "compensation_promise",
        "body_over_6000_chars",
        "title_over_60_chars",
        "bio_over_150_chars",
        "alt_text_missing",
        "too_many_hashtags",
        "jsonld_missing",
      ],
    };
    const parsed = parseVersionMeta(meta, "agent");
    expect(parsed.guardrails).toEqual([
      { code: "prohibited_term", detail: "best in town" },
      { code: "compensation_promise" },
      { code: "length", detail: "6000" },
      { code: "title_too_long", detail: "60" },
      { code: "bio_too_long", detail: "150" },
      { code: "alt_text_missing" },
      { code: "too_many_hashtags" },
      { code: "jsonld_missing" },
    ]);
    expect(parsed.agentNotes).toEqual([]);
  });

  it("keeps an unrecognised warning visible instead of discarding it", () => {
    // A new agent code must degrade to something the approver can read.
    const parsed = parseVersionMeta({ warnings: ["some_future_code", "compensation_promise"] }, "agent");
    expect(parsed.guardrails).toEqual([{ code: "compensation_promise" }]);
    expect(parsed.agentNotes).toEqual(["some_future_code"]);
  });

  it("separates a clean checked draft from one nothing checked", () => {
    // This distinction is the whole reason `checked` exists: a hand-typed edit
    // and a clean agent draft would otherwise render identically.
    expect(parseVersionMeta({ warnings: [] }, "agent")).toMatchObject({ checked: true, guardrails: [] });
    expect(parseVersionMeta({}, "user")).toMatchObject({ checked: false, guardrails: [] });
    expect(parseVersionMeta(null, "user")).toMatchObject({ checked: false, guardrails: [] });
  });

  it("falls back to the author type for rows written before origin existed", () => {
    expect(parseVersionMeta({ warnings: [] }, "agent").origin).toBe("agent_run");
    expect(parseVersionMeta({}, "user").origin).toBe("manual");
    expect(parseVersionMeta({ origin: "assistant" }, "agent").origin).toBe("assistant");
    // An unknown origin string must not leak through as an origin.
    expect(parseVersionMeta({ origin: "something_else" }, "agent").origin).toBe("agent_run");
  });

  it("survives a malformed meta blob without throwing", () => {
    // meta is jsonb NOT NULL DEFAULT '{}', but nothing constrains its shape.
    for (const bad of [undefined, null, 42, "text", [], { warnings: "not-an-array" }, { warnings: [1, null, "compensation_promise"] }]) {
      expect(() => parseVersionMeta(bad, "user")).not.toThrow();
    }
    // Non-string entries are dropped; the string one still classifies.
    expect(parseVersionMeta({ warnings: [1, null, "compensation_promise"] }, "agent").guardrails).toEqual([{ code: "compensation_promise" }]);
  });

  it("reports the agent key when one was recorded", () => {
    expect(parseVersionMeta({ agent_key: "review_reply", warnings: [] }, "agent").agentKey).toBe("review_reply");
    expect(parseVersionMeta({ agent_key: "" }, "agent").agentKey).toBeNull();
    expect(parseVersionMeta({}, "user").agentKey).toBeNull();
  });
});
