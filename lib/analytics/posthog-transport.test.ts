import { afterEach, expect, it, vi } from "vitest";
import { forwardEventToPostHog } from "./record-event";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("uses the shared PostHog transport with application environment", async () => {
  vi.stubEnv("POSTHOG_KEY", "app-fixture");
  vi.stubEnv("POSTHOG_HOST", "https://app.fixture/");
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetch);
  await forwardEventToPostHog(
    { name: "full_report_viewed", properties: { access: "staff" } },
    "app-session",
  );
  expect(fetch).toHaveBeenCalledWith(
    "https://app.fixture/capture/",
    expect.objectContaining({
      method: "POST",
      signal: expect.any(AbortSignal),
      body: JSON.stringify({
        api_key: "app-fixture",
        event: "full_report_viewed",
        properties: { distinct_id: "app-session", access: "staff" },
      }),
    }),
  );
});
