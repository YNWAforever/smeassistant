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
});
