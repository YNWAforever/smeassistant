import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  llmChatDetailed: vi.fn(),
  llmChatStreamDetailed: vi.fn(),
  llmConfigured: vi.fn(),
}));

vi.mock("@/lib/llm", () => ({
  llmChatDetailed: (...args: unknown[]) => mocks.llmChatDetailed(...args),
  llmChatStreamDetailed: (...args: unknown[]) => mocks.llmChatStreamDetailed(...args),
  llmConfigured: () => mocks.llmConfigured(),
}));

import { POST } from "./route";

const TOKEN = "health-token-for-tests";

function request(token?: string): Request {
  return new Request("https://app.test/api/ops/studio-health", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STUDIO_HEALTH_TOKEN", TOKEN);
  vi.stubEnv("LLM_MODEL", "deepseek-v4.1-flash");
  mocks.llmConfigured.mockReturnValue(true);
  mocks.llmChatDetailed.mockResolvedValue({ ok: true, result: { text: '{"intent":"answer"}', usage: { inputTokens: 1, outputTokens: 2 } } });
  mocks.llmChatStreamDetailed.mockImplementation(async (_messages, _opts, onDelta: (delta: string) => void) => {
    onDelta("Studio ");
    onDelta("gateway reachable.");
    return { ok: true, result: { text: "Studio gateway reachable.", usage: { inputTokens: 1, outputTokens: 2 } }, streamed: true };
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/ops/studio-health", () => {
  it("is a 404 without the operator token and never calls the gateway", async () => {
    expect((await POST(request())).status).toBe(404);
    expect((await POST(request("wrong"))).status).toBe(404);
    expect(mocks.llmChatDetailed).not.toHaveBeenCalled();
    vi.stubEnv("STUDIO_HEALTH_TOKEN", "");
    expect((await POST(request())).status).toBe(404);
  });

  it("probes both call shapes and reports only shape metadata", async () => {
    const response = await POST(request(TOKEN));
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ ok: true, model: "deepseek-v4.1-flash" });
    expect(body.classifier).toMatchObject({ ok: true, text: '{"intent":"answer"}', attempts: 1 });
    expect(body.stream).toMatchObject({ ok: true, streamed: true });
    expect(JSON.stringify(body)).not.toContain("Studio gateway reachable");
    expect(mocks.llmChatDetailed).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ jsonMode: true }));
    expect(mocks.llmChatStreamDetailed).toHaveBeenCalled();
  });

  it("reports a failed shape without leaking provider text", async () => {
    mocks.llmChatStreamDetailed.mockResolvedValueOnce({ ok: false, code: "provider_unavailable", status: 400, streamed: false });
    const response = await POST(request(TOKEN));
    expect(response.status).toBe(502);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ ok: false, stream: { ok: false, code: "provider_unavailable" } });
    expect(JSON.stringify(body)).not.toContain("SENTINEL");
  });

  it("retries an unparseable classifier once", async () => {
    mocks.llmChatDetailed
      .mockResolvedValueOnce({ ok: true, result: { text: '{"int##ent##": "##"}', usage: { inputTokens: 1, outputTokens: 2 } } })
      .mockResolvedValueOnce({ ok: true, result: { text: '{"intent":"answer"}', usage: { inputTokens: 1, outputTokens: 2 } } });
    const response = await POST(request(TOKEN));
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body.classifier).toMatchObject({ ok: true, attempts: 2 });
    expect(mocks.llmChatDetailed).toHaveBeenCalledTimes(2);
  });

  it("returns 503 when the deployment has no gateway configuration", async () => {
    mocks.llmConfigured.mockReturnValueOnce(false);
    const response = await POST(request(TOKEN));
    expect(response.status).toBe(503);
    expect(mocks.llmChatDetailed).not.toHaveBeenCalled();
  });
});
