import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Conversation Studio LLM wrapper (design §6.3). Every request is a stubbed
 * `fetch`: no network, no provider, no cost.
 */

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function delta(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

const MESSAGES = [
  { role: "system" as const, content: "system rules" },
  { role: "assistant" as const, content: "earlier answer" },
  { role: "user" as const, content: "new question" },
];

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("AI_DRAFTS_PAUSED", "");
  vi.stubEnv("OPENCODE_API_KEY", "fixture-key");
  vi.stubEnv("LLM_API_KEY", "");
  vi.stubEnv("OPENROUTER_KEY", "");
  vi.stubEnv("LLM_BASE_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("llmChatDetailed", () => {
  it("forwards the ordered messages and reads usage", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "grounded answer" } }],
      usage: { prompt_tokens: 120, completion_tokens: 34 },
    })));
    vi.stubGlobal("fetch", fetchMock);
    const { llmChatDetailed } = await import("./llm");
    const outcome = await llmChatDetailed(MESSAGES, { maxTokens: 400, temperature: 0.2 });
    expect(outcome).toEqual({ ok: true, result: { text: "grounded answer", usage: { inputTokens: 120, outputTokens: 34 } } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.messages).toEqual(MESSAGES);
    expect(body.max_tokens).toBe(400);
    expect(body.temperature).toBe(0.2);
    expect(body.stream).toBeUndefined();
  });

  it("keeps the existing provider error mapping and never reads the error body", async () => {
    const body = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, headers: new Headers({ "Retry-After": "9" }), json: body })));
    const { llmChatDetailed } = await import("./llm");
    expect(await llmChatDetailed(MESSAGES)).toMatchObject({ ok: false, code: "provider_rate_limited", status: 429, retryable: true, retryAfterSeconds: 9 });
    expect(body).not.toHaveBeenCalled();
  });

  it("refuses before any fetch when AI is paused", async () => {
    vi.stubEnv("AI_DRAFTS_PAUSED", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { llmChatDetailed } = await import("./llm");
    expect(await llmChatDetailed(MESSAGES)).toEqual({ ok: false, code: "ai_paused", retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("llmChatStreamDetailed", () => {
  it("streams content deltas, concatenates them and resolves usage", async () => {
    const chunks = [
      delta("Hello "),
      delta("owner"),
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 42, completion_tokens: 7 } })}\n\n`,
      "data: [DONE]\n\n",
    ];
    const fetchMock = vi.fn(async () => sseResponse(chunks));
    vi.stubGlobal("fetch", fetchMock);
    const deltas: string[] = [];
    const { llmChatStreamDetailed } = await import("./llm");
    const outcome = await llmChatStreamDetailed(MESSAGES, { maxTokens: 200 }, (text) => deltas.push(text));
    expect(outcome).toEqual({ ok: true, streamed: true, result: { text: "Hello owner", usage: { inputTokens: 42, outputTokens: 7 } } });
    expect(deltas).toEqual(["Hello ", "owner"]);
    const request = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(request.stream).toBe(true);
    expect(request.messages).toEqual(MESSAGES);
  });

  it("ignores keep-alives and malformed frames", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([": keep-alive\n\n", "data: {broken\n\n", delta("ok"), "data: [DONE]\n\n"])));
    const { llmChatStreamDetailed } = await import("./llm");
    const outcome = await llmChatStreamDetailed(MESSAGES, {}, () => {});
    expect(outcome).toMatchObject({ ok: true, result: { text: "ok" } });
  });

  it("falls back once to the non-streaming call when the stream fails before the first token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("gateway exploded", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "fallback answer" } }], usage: { prompt_tokens: 5, completion_tokens: 3 } })));
    vi.stubGlobal("fetch", fetchMock);
    const { llmChatStreamDetailed } = await import("./llm");
    const outcome = await llmChatStreamDetailed(MESSAGES, {}, () => {});
    expect(outcome).toEqual({ ok: true, streamed: false, result: { text: "fallback answer", usage: { inputTokens: 5, outputTokens: 3 } } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("no longer falls back once a token arrived: returns the partial text and a typed interruption", async () => {
    const encoder = new TextEncoder();
    let delivered = false;
    const failure = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!delivered) {
          delivered = true;
          controller.enqueue(encoder.encode(delta("partial answer")));
          return;
        }
        controller.error(new Error("connection reset"));
      },
    });
    const fetchMock = vi.fn(async () => new Response(failure, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { llmChatStreamDetailed } = await import("./llm");
    const outcome = await llmChatStreamDetailed(MESSAGES, {}, () => {});
    expect(outcome).toMatchObject({ ok: false, code: "stream_interrupted", text: "partial answer", streamed: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back when a stream closes without any token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseResponse(["data: [DONE]\n\n"]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "non-streamed" } }] })));
    vi.stubGlobal("fetch", fetchMock);
    const { llmChatStreamDetailed } = await import("./llm");
    expect(await llmChatStreamDetailed(MESSAGES, {}, () => {})).toMatchObject({ ok: true, streamed: false, result: { text: "non-streamed" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses a paused stream before any fetch", async () => {
    vi.stubEnv("AI_DRAFTS_PAUSED", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { llmChatStreamDetailed } = await import("./llm");
    expect(await llmChatStreamDetailed(MESSAGES, {}, () => {})).toMatchObject({ ok: false, code: "ai_paused" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
