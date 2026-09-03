import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Token usage must survive the gateway call.
 *
 * The response body always carried it and llmComplete read only
 * choices[0].message.content, so nothing could measure what a completion cost.
 * docs/v0.2-plan.md section 7.1 flags the sequencing hazard: add agent_runs.cost
 * before usage is available and the column ships permanently null, exactly as
 * leads.lead_score did.
 */

async function loadLLM() {
  vi.resetModules();
  return import("./llm");
}

function stubFetch(body: unknown) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => body,
    text: async () => "",
  })) as unknown as typeof fetch;
}

const COMPLETION = { choices: [{ message: { content: "  a summary  " } }] };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("llmComplete usage", () => {
  it("returns the trimmed text alongside token counts", async () => {
    vi.stubEnv("OPENCODE_API_KEY", "key");
    vi.stubGlobal("fetch", stubFetch({ ...COMPLETION, usage: { prompt_tokens: 812, completion_tokens: 149 } }));
    const { llmComplete } = await loadLLM();

    const result = await llmComplete("hello");
    expect(result).toEqual({ text: "a summary", usage: { inputTokens: 812, outputTokens: 149 } });
  });

  it("reports null counts when the gateway omits usage", async () => {
    // Not every OpenAI-compatible gateway returns it. A missing count must read as
    // unknown, never as zero — zero would understate real spend in any total.
    vi.stubEnv("OPENCODE_API_KEY", "key");
    vi.stubGlobal("fetch", stubFetch(COMPLETION));
    const { llmComplete } = await loadLLM();

    const result = await llmComplete("hello");
    expect(result?.usage).toEqual({ inputTokens: null, outputTokens: null });
  });

  it("rejects nonsense counts rather than passing them through", async () => {
    vi.stubEnv("OPENCODE_API_KEY", "key");
    vi.stubGlobal(
      "fetch",
      stubFetch({ ...COMPLETION, usage: { prompt_tokens: "812", completion_tokens: -3 } }),
    );
    const { llmComplete } = await loadLLM();

    const result = await llmComplete("hello");
    expect(result?.usage).toEqual({ inputTokens: null, outputTokens: null });
  });

  it("still collapses an empty completion to null", async () => {
    // The single "no completion" branch every caller relies on must not change
    // shape just because usage arrived.
    vi.stubEnv("OPENCODE_API_KEY", "key");
    vi.stubGlobal("fetch", stubFetch({ choices: [{ message: { content: "   " } }], usage: { prompt_tokens: 5 } }));
    const { llmComplete } = await loadLLM();

    expect(await llmComplete("hello")).toBeNull();
  });
});
