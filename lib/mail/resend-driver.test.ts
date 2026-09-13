import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendViaResend } from "./resend-driver";

const MESSAGE = { to: "owner@example.test", subject: "Hi", text: "body", dedupeKey: "k1" };
const CONFIG = { apiKey: "key-1", from: "noreply@fimmick.com" };

describe("sendViaResend", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("sends from/to/subject/text as configured, with auth in the header rather than the body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "msg-1" }), { status: 200 }));
    global.fetch = fetchMock;
    await sendViaResend(CONFIG, MESSAGE);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer key-1");
    expect(JSON.parse(init.body as string)).toEqual({
      from: CONFIG.from,
      to: MESSAGE.to,
      subject: MESSAGE.subject,
      text: MESSAGE.text,
    });
  });

  it("reports accepted_by_provider with the provider message id on a 2xx response", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "msg-123" }), { status: 200 }));
    expect(await sendViaResend(CONFIG, MESSAGE)).toEqual({ status: "accepted_by_provider", providerMessageId: "msg-123" });
  });

  it("reports failed with the provider's own message on a non-2xx response, never accepted", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "invalid `from` field" }), { status: 422 }));
    expect(await sendViaResend(CONFIG, MESSAGE)).toEqual({ status: "failed", error: "invalid `from` field" });
  });

  it("reports failed with a status-coded reason when a non-2xx body doesn't parse", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("not json", { status: 500 }));
    expect(await sendViaResend(CONFIG, MESSAGE)).toEqual({ status: "failed", error: "provider_http_500" });
  });

  it("reports failed rather than accepted when a 2xx body carries no provider id", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    expect(await sendViaResend(CONFIG, MESSAGE)).toEqual({ status: "failed", error: "provider_response_missing_id" });
  });

  it("reports failed on a network error, never throws", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));
    expect(await sendViaResend(CONFIG, MESSAGE)).toEqual({ status: "failed", error: "network_error" });
  });

  it("reports a timed_out reason, distinct from a generic network error, when the request is aborted", async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn((_url: string, init: { signal: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const abortError = new Error("aborted");
          abortError.name = "AbortError";
          reject(abortError);
        });
      });
    }) as unknown as typeof fetch;
    const resultPromise = sendViaResend(CONFIG, MESSAGE);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await resultPromise).toEqual({ status: "failed", error: "timed_out" });
  });
});
