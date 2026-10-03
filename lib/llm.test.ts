import { afterEach, describe, expect, it, vi } from "vitest";

async function loadLLM() {
  vi.resetModules();
  return import("./llm");
}

describe("llm config resolution", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not report configured when only an OpenRouter key is paired with the OpenCode base", async () => {
    vi.stubEnv("OPENCODE_API_KEY", "");
    vi.stubEnv("LLM_API_KEY", "");
    vi.stubEnv("OPENROUTER_KEY", "sk-openrouter-test");
    vi.stubEnv("LLM_BASE_URL", "https://opencode.ai/zen/go/v1");

    const { llmConfigured } = await loadLLM();

    expect(llmConfigured()).toBe(false);
  });

  it("reports configured when the OpenRouter key is paired with the OpenRouter base", async () => {
    vi.stubEnv("OPENCODE_API_KEY", "");
    vi.stubEnv("LLM_API_KEY", "");
    vi.stubEnv("OPENROUTER_KEY", "sk-openrouter-test");
    vi.stubEnv("LLM_BASE_URL", "https://openrouter.ai/api/v1");

    const { llmConfigured } = await loadLLM();

    expect(llmConfigured()).toBe(true);
  });

  it("uses the OpenRouter key and model when both key families are set and the base is OpenRouter", async () => {
    vi.stubEnv("OPENCODE_API_KEY", "sk-opencode-test");
    vi.stubEnv("LLM_API_KEY", "");
    vi.stubEnv("OPENROUTER_KEY", "sk-openrouter-test");
    vi.stubEnv("LLM_BASE_URL", "https://openrouter.ai/api/v1");

    const { llmConfigured, llmComplete } = await loadLLM();

    expect(llmConfigured()).toBe(true);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await llmComplete("hello", { timeoutMs: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-openrouter-test",
        }),
        body: expect.stringContaining('"model":"openai/gpt-4o-mini"'),
      }),
    );
  });

  it("prefers the OpenCode key family, model, and base when LLM_BASE_URL is unset", async () => {
    vi.stubEnv("OPENCODE_API_KEY", "");
    vi.stubEnv("LLM_API_KEY", "sk-opencode-legacy-test");
    vi.stubEnv("OPENROUTER_KEY", "sk-openrouter-test");
    vi.stubEnv("LLM_BASE_URL", "");

    const { llmConfigured, llmComplete } = await loadLLM();

    expect(llmConfigured()).toBe(true);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await llmComplete("hello", { timeoutMs: 10 });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://opencode.ai/zen/go/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-opencode-legacy-test",
        }),
        body: expect.stringContaining('"model":"deepseek-v4-flash"'),
      }),
    );
  });

  it.each([
    {
      title: "prefers OPENCODE_API_KEY",
      opencodeKey: "sk-opencode-test",
      legacyKey: "",
      expectedKey: "sk-opencode-test",
    },
    {
      title: "falls back to LLM_API_KEY",
      opencodeKey: "",
      legacyKey: "sk-legacy-opencode-test",
      expectedKey: "sk-legacy-opencode-test",
    },
    {
      title: "falls back to OPENROUTER_KEY",
      opencodeKey: "",
      legacyKey: "",
      expectedKey: "sk-openrouter-test",
    },
  ])("uses the custom-base key precedence and %s", async ({ opencodeKey, legacyKey, expectedKey }) => {
    vi.stubEnv("OPENCODE_API_KEY", opencodeKey);
    vi.stubEnv("LLM_API_KEY", legacyKey);
    vi.stubEnv("OPENROUTER_KEY", "sk-openrouter-test");
    vi.stubEnv("LLM_BASE_URL", "https://custom.example/v1");

    const { llmConfigured, llmComplete } = await loadLLM();

    expect(llmConfigured()).toBe(true);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await llmComplete("hello", { timeoutMs: 10 });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://custom.example/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${expectedKey}`,
        }),
      }),
    );
  });

  it("returns null without any network call while AI is paused", async () => {
    vi.stubEnv("AI_DRAFTS_PAUSED", "true");
    vi.stubEnv("OPENCODE_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { llmComplete } = await loadLLM();
    expect(await llmComplete("prompt")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("llmComplete error logging", () => {
  const SENTINEL = "SENTINEL-review-text-Waited-forty-minutes";

  async function configured() {
    vi.stubEnv("AI_DRAFTS_PAUSED", "");
    vi.stubEnv("OPENCODE_API_KEY", "sk-opencode-test");
    vi.stubEnv("LLM_API_KEY", "");
    vi.stubEnv("OPENROUTER_KEY", "");
    vi.stubEnv("LLM_BASE_URL", "");
    return loadLLM();
  }

  const logged = (spy: ReturnType<typeof vi.spyOn>) =>
    spy.mock.calls.map((call: unknown[]) => call.map((arg) => (arg instanceof Error ? `${arg.name} ${arg.message} ${arg.stack}` : typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ")).join("\n");

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("with redactErrors, a non-2xx body is not logged, only the status", async () => {
    const { llmComplete } = await configured();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => JSON.stringify({ error: { metadata: { flagged_input: SENTINEL } } }) }));

    await expect(llmComplete("prompt", { redactErrors: true })).resolves.toBeNull();

    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("[llm] API error", { status: 403 });
    expect(logged(error)).not.toContain("SENTINEL");
  });

  it("with redactErrors, a thrown error logs only its class name", async () => {
    const { llmComplete } = await configured();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError(SENTINEL)));

    await expect(llmComplete("prompt", { redactErrors: true })).resolves.toBeNull();

    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("[llm] request failed", { error: "TypeError" });
    expect(logged(error)).not.toContain("SENTINEL");
  });

  it("without redactErrors, logging is unchanged", async () => {
    const { llmComplete } = await configured();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = `{"error":"${SENTINEL}"}`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => body }));
    await llmComplete("prompt");
    expect(error).toHaveBeenLastCalledWith(`[llm] API error 500: ${body.slice(0, 300)}`);

    const thrown = new Error(SENTINEL);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(thrown));
    await llmComplete("prompt", { redactErrors: false });
    expect(error).toHaveBeenLastCalledWith("[llm] request failed:", thrown);
  });
});
