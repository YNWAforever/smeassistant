import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabase/admin";
import {
  createAnalyticsDependencies,
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

/**
 * apps/web's env contract, kept out of @sme-scanner/scan-engine on purpose:
 * the package is bundled into a Cloudflare Worker that has no supabaseServer()
 * and no NEXT_PUBLIC_* variables. Every caller in this app keeps its existing
 * two-argument recordEvent(input, context) call because the default lives here.
 *
 * Passes the supabaseServer function itself, not its result: the engine's
 * createAnalyticsDependencies calls it lazily inside `insert`, so a throwing
 * createClient() (e.g. its Node-version guard) surfaces inside recordEvent's
 * try/catch instead of rejecting before recordEvent's body ever runs.
 */
function defaultDependencies(): AnalyticsDependencies {
  return createAnalyticsDependencies(supabaseServer);
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
  return forwardEventToPostHogCore(input, anonymousSessionId, dependencies, timeoutMs);
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
    if (key === ANALYTICS_SESSION_COOKIE && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      return { id: value, created: false };
    }
  }
  return { id: randomUUID(), created: true };
}

export function setAnalyticsSessionCookie(response: Response, session: AnalyticsSession): void {
  if (!session.created) return;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append(
    "set-cookie",
    ANALYTICS_SESSION_COOKIE + "=" + encodeURIComponent(session.id) +
      "; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax" + secure,
  );
}
