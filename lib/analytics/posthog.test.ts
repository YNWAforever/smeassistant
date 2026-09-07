import { afterEach, describe, expect, it, vi } from "vitest";
import { capturePostHog } from "./posthog";
describe("app-owned PostHog transport", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("sends an event to the normalized host", async () => {
    vi.stubEnv("POSTHOG_KEY", "fixture-key");
    vi.stubEnv("POSTHOG_HOST", "https://posthog.example.test/");
    const request = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", request);
    await capturePostHog(
      { name: "report_preview_viewed", properties: { market: "HK" } },
      "session",
      new AbortController().signal,
    );
    expect(request).toHaveBeenCalledWith(
      "https://posthog.example.test/capture/",
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      JSON.parse(
        (request.mock.calls[0] as unknown as [string, RequestInit])[1]
          .body as string,
      ),
    ).toEqual({
      api_key: "fixture-key",
      event: "report_preview_viewed",
      properties: { distinct_id: "session", market: "HK" },
    });
  });
  it("does not send when unconfigured", async () => {
    vi.stubEnv("POSTHOG_KEY", "");
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await capturePostHog(
      { name: "report_preview_viewed", properties: { market: "HK" } },
      "session",
      new AbortController().signal,
    );
    expect(request).not.toHaveBeenCalled();
  });
  it("rejects non-ok responses", async () => {
    vi.stubEnv("POSTHOG_KEY", "fixture");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    );
    await expect(
      capturePostHog(
        { name: "report_preview_viewed", properties: { market: "HK" } },
        "session",
        new AbortController().signal,
      ),
    ).rejects.toThrow("posthog_capture_failed");
  });
});
