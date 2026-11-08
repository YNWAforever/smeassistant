import { describe, expect, it } from "vitest";

import { SMOKE_ANSWER_MESSAGES, SMOKE_CLASSIFIER_MESSAGES, summarizeStudioSmoke, type StudioSmokeInput } from "./studio-smoke";

const okStream = {
  ok: true as const,
  streamed: true,
  result: { text: "The Studio gateway is reachable.", usage: { inputTokens: 12, outputTokens: 8 } },
};

function input(overrides: Partial<StudioSmokeInput> = {}): StudioSmokeInput {
  return {
    classifierOk: true,
    classifierIntent: "answer",
    stream: okStream,
    deltas: ["The Studio ", "gateway is reachable."],
    ...overrides,
  };
}

describe("studio gateway smoke check", () => {
  it("passes only when the classifier JSON and the streamed answer are both complete", () => {
    expect(summarizeStudioSmoke(input())).toEqual({
      ok: true,
      checks: {
        classifierCompleted: true,
        classifierJsonParsed: true,
        classifierIntentAnswer: true,
        streamCompleted: true,
        streamUsedDeltas: true,
        streamTextNonEmpty: true,
        deltasMatchText: true,
      },
    });
  });

  it("reports every failing shape instead of throwing", () => {
    const result = summarizeStudioSmoke(input({
      classifierOk: false,
      classifierIntent: null,
      stream: { ok: false, code: "stream_interrupted", retryable: false, text: "partial", usage: { inputTokens: 1, outputTokens: 2 }, streamed: true },
      deltas: ["partial"],
    }));
    expect(result.ok).toBe(false);
    expect(result.checks.classifierCompleted).toBe(false);
    expect(result.checks.classifierJsonParsed).toBe(false);
    expect(result.checks.classifierIntentAnswer).toBe(false);
    expect(result.checks.streamCompleted).toBe(false);
    expect(result.checks.streamUsedDeltas).toBe(false);
    expect(result.checks.streamTextNonEmpty).toBe(false);
  });

  it("fails when the prose came from the non-streaming fallback", () => {
    expect(summarizeStudioSmoke(input({
      stream: { ok: true, streamed: false, result: { text: "fallback answer", usage: { inputTokens: 1, outputTokens: 2 } } },
      deltas: [],
    })).checks.streamUsedDeltas).toBe(false);
  });

  it("pins probe messages that cannot be mistaken for workspace data", () => {
    expect(SMOKE_CLASSIFIER_MESSAGES[0]).toMatchObject({ role: "system" });
    expect(SMOKE_CLASSIFIER_MESSAGES[1].content).toContain('{"intent":"answer"}');
    expect(SMOKE_ANSWER_MESSAGES).toHaveLength(2);
  });
});
