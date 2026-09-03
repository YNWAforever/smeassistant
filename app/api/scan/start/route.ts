import { NextResponse } from "next/server";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { recordEvent, resolveAnalyticsSession, setAnalyticsSessionCookie } from "@/lib/analytics/record-event";
import { insertScanJob, parseScanStartBody } from "@/lib/scan/start-job";

/**
 * Upstream's contract, unchanged (CLAUDE.md 3.2.2): validation, the scan_start
 * rate limit, the audit_jobs insert and the scan_started analytics event all
 * live in lib/scan/start-job.ts. Any `workspace_id` / `location_id` in the
 * client body is deliberately never read -- attribution is server-side only.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseScanStartBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const limiter = await enforceRateLimit({ req, scope: "scan_start", failClosed: false });
  if (!limiter.allowed) return rateLimitedResponse(limiter.retryAfterSeconds);

  const created = await insertScanJob(parsed.input);
  if (!created.ok) {
    console.error("Supabase insert error:", created.error);
    return NextResponse.json({ error: "Failed to create scan job" }, { status: 500 });
  }

  const session = resolveAnalyticsSession(req);
  void recordEvent(
    { name: "scan_started", properties: { market: parsed.input.market, locale: parsed.input.locale } },
    { jobId: created.jobId, anonymousSessionId: session.id },
  ).catch(() => {
    console.error("[analytics] event_record_failed", { category: "transition_record_failed" });
  });
  const response = NextResponse.json({ jobId: created.jobId });
  setAnalyticsSessionCookie(response, session);
  return response;
}
