import { randomUUID } from "crypto";
import { eventRepository } from "@/lib/repositories/events";
import {
  recordEvent as recordEventCore,
  forwardEventToPostHog as forwardEventToPostHogCore,
  type AnalyticsDependencies,
  type RecordEventContext,
} from "@sme-scanner/scan-engine";

export {
  AnalyticsValidationError,
  parseScanEvent,
} from "@sme-scanner/scan-engine";
export type {
  AnalyticsDependencies,
  AnalyticsEventRow,
  RecordEventContext,
} from "@sme-scanner/scan-engine";

/** Keep the engine validation/failure contract and app-owned PostHog transport. */
function defaultDependencies(): AnalyticsDependencies {
  return {
    insert: (row, signal) => eventRepository().insert(row, signal),
    capturePostHog: async (event, anonymousSessionId, signal) => {
      const key = process.env.POSTHOG_KEY;
      if (!key) return;
      const host = (
        process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com"
      ).replace(/\/$/, "");
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
    },
    reportError: (category) =>
      console.error("[analytics] event_record_failed", { category }),
  };
}

export async function recordEvent(
  input: unknown,
  context: RecordEventContext,
  dependencies: AnalyticsDependencies = defaultDependencies(),
): ReturnType<typeof recordEventCore> {
  return recordEventCore(input, context, dependencies);
}

export async function forwardEventToPostHog(
  input: unknown,
  anonymousSessionId: string,
  dependencies: AnalyticsDependencies = defaultDependencies(),
  timeoutMs = 2000,
): Promise<void> {
  return forwardEventToPostHogCore(
    input,
    anonymousSessionId,
    dependencies,
    timeoutMs,
  );
}

export const ANALYTICS_SESSION_COOKIE = "sme_analytics_session";

export interface AnalyticsSession {
  id: string;
  created: boolean;
}

export function resolveAnalyticsSession(request: Request): AnalyticsSession {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    let value: string;
    try {
      value = decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      continue;
    }
    if (
      key === ANALYTICS_SESSION_COOKIE &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      return { id: value, created: false };
    }
  }
  return { id: randomUUID(), created: true };
}

export function setAnalyticsSessionCookie(
  response: Response,
  session: AnalyticsSession,
): void {
  if (!session.created) return;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append(
    "set-cookie",
    ANALYTICS_SESSION_COOKIE +
      "=" +
      encodeURIComponent(session.id) +
      "; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax" +
      secure,
  );
}
