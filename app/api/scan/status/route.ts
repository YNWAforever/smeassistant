import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/admin";
import { enforceCompositeIdentifierRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "jobId is invalid" }, { status: 400 });
  }

  const limiter = await enforceCompositeIdentifierRateLimit({
    req,
    scope: "scan_status",
    identifier: jobId,
    failClosed: false,
  });
  if (!limiter.allowed) return rateLimitedResponse(limiter.retryAfterSeconds);

  const supabase = supabaseServer();
  const { data: job, error } = await supabase
    .from("audit_jobs")
    .select("id, status, processing_stage, share_slug, score_coverage, failure_correlation_id")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: job.status as string,
    shareSlug: job.share_slug as string | null,
    processingStage: job.processing_stage as string | null,
    coverage: job.score_coverage as number | null,
    failureCorrelationId: job.failure_correlation_id as string | null,
  });
}
