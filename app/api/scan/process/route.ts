import { NextResponse } from "next/server";
import { enforceCompositeIdentifierRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { resolveAnalyticsSession, setAnalyticsSessionCookie } from "@/lib/analytics/record-event";
import { assertScanConsent } from "@/lib/scan/consent-gate";
import { dispatchToScanWorker, resolveScanExecutionRuntime, runScan } from "@/lib/scan/run";

// Phase 2 lengthens the synchronous path, and an unset maxDuration lets the
// platform cut a scan off wherever it likes. 300s is the current default ceiling
// on every Vercel plan, so it is the safe floor-and-default here; a value above
// the tier's ceiling fails at deploy, not at runtime.
export const maxDuration = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const jobId = body && typeof body === "object" ? (body as Record<string, unknown>).jobId : null;
  if (typeof jobId !== "string" || !UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const limiter = await enforceCompositeIdentifierRateLimit({
    req,
    scope: "scan_process",
    identifier: jobId,
    // This dispatches paid provider calls (SerpApi/Places/RapidAPI via
    // collect-providers.ts). If the limiter's own configuration is
    // unavailable, refuse the spend rather than let it through unbounded --
    // scan_status (read-only polling) is the route that stays fail-open.
    failClosed: true,
  });
  if (!limiter.allowed) return rateLimitedResponse(limiter.retryAfterSeconds);

  // Resolved before the gate: it only reads the cookie or mints an id, with no
  // side effect, and a refused job is terminal, so the gate writes its
  // scan_completed under this session.
  const session = resolveAnalyticsSession(req);

  // After the limiter (so abuse of the gate itself is still bounded) and before
  // any provider call or worker dispatch. This is where a direct
  // POST /api/scan/start bypass, or any hand-inserted queued row, stops: the
  // job is marked failed and the scanning page's existing failure card
  // surfaces it with the correlation id.
  const consent = await assertScanConsent(jobId, session.id);
  if (!consent.ok) {
    const response = NextResponse.json(
      consent.status === 503 ? { error: "unavailable" } : { error: consent.code, correlationId: consent.correlationId },
      { status: consent.status },
    );
    // A refusal writes scan_completed under this session when it is the call
    // that moved the job to failed (a reload after a refusal finds the job no
    // longer queued and writes nothing). Either way the browser should keep
    // this session. A 503 wrote nothing and needs no cookie.
    if (consent.status === 403) setAnalyticsSessionCookie(response, session);
    return response;
  }

  if (resolveScanExecutionRuntime("client") === "cloudflare") {
    const accepted = await dispatchToScanWorker(jobId);
    // The scanning page fires this with `void fetch(...).catch(() => {})` and
    // reads nothing from the response -- progress comes entirely from polling
    // GET /api/scan/status. The status code is for operators, not the client.
    const response = NextResponse.json({ accepted }, { status: accepted ? 202 : 502 });
    setAnalyticsSessionCookie(response, session);
    return response;
  }

  // lib/scan/run.ts picks the live collector or the fixture collector by
  // SCAN_SOURCES; everything else is upstream's processScan, unchanged.
  const result = await runScan(jobId, session.id);
  // P3.5a: a metered claim (a retry, or a first attempt whose reservation
  // has expired) refused on the spend budget. The job stays claimable, so
  // the cron reclaim offers it again on a later tick.
  if (result.status === "at_capacity") {
    const refused = NextResponse.json({ error: "at_capacity" }, { status: 503 });
    setAnalyticsSessionCookie(refused, session);
    return refused;
  }
  const response = NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
  setAnalyticsSessionCookie(response, session);
  return response;
}
