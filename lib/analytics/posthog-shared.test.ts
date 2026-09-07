import { afterEach, expect, it, vi } from "vitest";
import { capturePostHog } from "./posthog";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("shares PostHog environment, payload, signal and failure behavior", async () => {
  vi.stubEnv("POSTHOG_KEY", "fixture-key");
  vi.stubEnv("POSTHOG_HOST", "https://fixture.test/");
  const transport = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", transport);
  const signal = new AbortController().signal;
  const event = {
    name: "full_report_viewed",
    properties: { access: "viewer" },
  } as const;
  await capturePostHog(event, "session", signal);
  expect(transport).toHaveBeenCalledWith("https://fixture.test/capture/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      api_key: "fixture-key",
      event: event.name,
      properties: { distinct_id: "session", ...event.properties },
    }),
  });
  transport.mockResolvedValue({ ok: false });
  await expect(capturePostHog(event, "session", signal)).rejects.toThrow(
    "posthog_capture_failed",
  );
  vi.stubEnv("POSTHOG_KEY", "");
  transport.mockClear();
  await capturePostHog(event, "session", signal);
  expect(transport).not.toHaveBeenCalled();
  vi.stubEnv("POSTHOG_KEY", "fixture-key");
  vi.stubEnv("POSTHOG_HOST", undefined);
  transport.mockResolvedValue({ ok: true });
  await capturePostHog(event, "session", signal);
  expect(transport.mock.calls[0][0]).toBe("https://eu.i.posthog.com/capture/");
});
