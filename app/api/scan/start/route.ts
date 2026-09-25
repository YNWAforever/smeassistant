import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { forwardEventToPostHog, resolveAnalyticsSession, setAnalyticsSessionCookie } from "@/lib/analytics/record-event";
import { currentScanConsentPolicyVersion } from "@/lib/scan/consent";
import { insertScanJob, parseScanStartBody } from "@/lib/scan/start-job";
import { ScanBudgetRefusal } from "@/lib/budgets/scan";

/**
 * Upstream's contract, unchanged (CLAUDE.md 3.2.2): validation, the scan_start
 * rate limit and the audit_jobs insert live in lib/scan/start-job.ts; the
 * audit_jobs insert and its scan_started event are one transaction in
 * lib/repositories/jobs.ts; only PostHog forwarding runs after the response.
 * Any `workspace_id` / `location_id` in the client body is deliberately never
 * read -- attribution is server-side only.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Parsing (including consent) runs before the limiter, so a consent-less POST
  // costs nothing. A 409 carries the current version so a tab left open across
  // a policy bump can re-ask against the text we actually publish now.
  const parsed = parseScanStartBody(body);
  if (!parsed.ok) {
    return NextResponse.json(
      parsed.status === 409 ? { error: parsed.error, policy_version: currentScanConsentPolicyVersion() } : { error: parsed.error },
      { status: parsed.status ?? 400 },
    );
  }

  const limiter = await enforceRateLimit({ req, scope: "scan_start", failClosed: false });
  if (!limiter.allowed) return rateLimitedResponse(limiter.retryAfterSeconds);

  // Resolved before the insert: scan_started is now written inside the job's
  // own transaction, which needs the session id.
  const session = resolveAnalyticsSession(req);
  const created = await insertScanJob(parsed.input, parsed.consent, { anonymousSessionId: session.id });
  if (!created.ok) {
    // Already logged as "[budget] refused" (or "[budget] check_failed") by the
    // admission check, which ran before anything was written.
    if (created.error instanceof ScanBudgetRefusal) {
      return NextResponse.json({ error: "at_capacity" }, { status: 503 });
    }
    const correlationId = randomUUID();
    // An invalid event cannot follow a successful parse today, but the cause is
    // logged as what it is rather than folded into database_unavailable.
    const category = created.error instanceof Error && created.error.message === "scan_event_invalid" ? "scan_event_invalid" : "database_unavailable";
    console.error("Scan persistence unavailable", { category, correlationId });
    return NextResponse.json({ error: "Failed to create scan job", correlationId }, { status: 503 });
  }

  // The durable row already committed with the job. Only PostHog transport is
  // left, and after() keeps it alive past the response: a bare `void` promise
  // may never run once a Vercel function freezes. It must not go through
  // recordEvent: with its default NULL dedupe key it would never conflict, so
  // it would insert a second, duplicate scan_started row and then forward it.
  const { startedEvent } = created;
  try {
    after(() =>
      forwardEventToPostHog(startedEvent, session.id).catch(() => {
        console.error("[analytics] event_record_failed", { category: "transition_record_failed" });
      }),
    );
  } catch {
    // after() throws synchronously when no waitUntil is available. The job is
    // already committed, so a 500 here would make the client retry and create
    // a duplicate job. Losing one PostHog forward is the lesser failure.
    console.error("[analytics] event_record_failed", { category: "transition_record_failed" });
  }
  const response = NextResponse.json({ jobId: created.jobId });
  setAnalyticsSessionCookie(response, session);
  return response;
}
