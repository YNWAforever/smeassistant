import { NextResponse } from "next/server";
import { enforceCompositeIdentifierRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { resolveAnalyticsSession, setAnalyticsSessionCookie } from "@/lib/analytics/record-event";
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
    failClosed: false,
  });
  if (!limiter.allowed) return rateLimitedResponse(limiter.retryAfterSeconds);

  const session = resolveAnalyticsSession(req);

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
  const response = NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
  setAnalyticsSessionCookie(response, session);
  return response;
}
