import type { ScanEvent } from "@sme-scanner/scan-engine";

export async function capturePostHog(
  event: ScanEvent,
  anonymousSessionId: string,
  signal: AbortSignal,
): Promise<void> {
  const key = process.env.POSTHOG_KEY;
  if (!key) return;
  const host = (process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com").replace(
    /\/$/,
    "",
  );
  const response = await fetch(host + "/capture/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      event: event.name,
      properties: { distinct_id: anonymousSessionId, ...event.properties },
    }),
    signal,
  });
  if (!response.ok) throw new Error("posthog_capture_failed");
}
