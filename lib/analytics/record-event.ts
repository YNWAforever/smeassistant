import { capturePostHog } from "./posthog";
import { randomUUID } from "crypto";
import {
  forwardEventToPostHog as forwardEventToPostHogCore,
  type AnalyticsDependencies,
} from "@sme-scanner/scan-engine";

export {
  AnalyticsValidationError,
  parseScanEvent,
} from "@sme-scanner/scan-engine";
export type { AnalyticsDependencies } from "@sme-scanner/scan-engine";

/**
 * PostHog transport only. scan_events rows are written in exactly one place,
 * lib/analytics/scan-events.ts, inside the transaction of the business write
 * they describe. There is deliberately no recordEvent here: the engine's
 * recordEvent inserts on a fresh connection under a 250 ms budget with a NULL
 * dedupe key by default, which silently lost events and never deduplicated
 * them (F-34). insert exists only because AnalyticsDependencies requires it;
 * forwardEventToPostHog never calls it, and it throws so that wiring these
 * dependencies into the engine's recordEvent cannot write a row.
 */
function defaultDependencies(): AnalyticsDependencies {
  return {
    insert: async () => {
      throw new Error(
        "scan_events rows are written only through lib/analytics/scan-events.ts, not analytics.insert",
      );
    },
    capturePostHog,
    reportError: (category) =>
      console.error("[analytics] event_record_failed", { category }),
  };
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
