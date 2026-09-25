import { NextResponse } from "next/server";
import { resolveOperator } from "@/lib/auth/operator";
import { deadLetterRepository } from "@/lib/repositories/dead-letter";
import { dispatchScanProcess } from "@/lib/scan/dispatch-process";

/**
 * POST /api/ops/failures/scans/[jobId]/release → 200 { released, dispatched } | 404 | 409 not_dead_lettered | 503
 *
 * P3.5b spec §2. Operator-only, and 404 to anyone else so the route's
 * existence is not a signal (the /ops convention). The guarded update in
 * deadLetterRepository().release is the whole decision: this route never
 * reads the job first, so there is no check-then-act window. The released job
 * keeps its consent, share slug and budget: its next claim is a retry claim,
 * checked against the P3.5a spend budget.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const operator = await resolveOperator();
  if (!operator) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  const { jobId } = await params;
  if (!UUID_RE.test(jobId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  let result;
  try {
    result = await deadLetterRepository().release(jobId, operator.userId);
  } catch {
    console.error("[ops] release_failed", { category: "scan_release_failed", jobId });
    return NextResponse.json({ error: "release_failed" }, { status: 503, headers: NO_STORE });
  }
  if (!result.released) return NextResponse.json({ error: "not_dead_lettered" }, { status: 409, headers: NO_STORE });

  // Best-effort: if this fails or APP_ORIGIN is unset, the next cron tick
  // reclaims the job, because it is claimable now.
  const dispatched = dispatchScanProcess(jobId, (cause) =>
    console.error("[ops] release_dispatch_failed", { category: "scan_release_dispatch_failed", jobId, message: cause instanceof Error ? cause.message : "unknown" }),
  );
  return NextResponse.json({ released: true, dispatched }, { headers: NO_STORE });
}
