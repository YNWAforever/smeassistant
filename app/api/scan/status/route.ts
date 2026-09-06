import { NextResponse } from "next/server";
import { jobsRepository } from "@/lib/repositories/jobs";
import { randomUUID } from "node:crypto";
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
    if (!limiter.allowed)
        return rateLimitedResponse(limiter.retryAfterSeconds);
    let job;
    try {
        job = await jobsRepository.readStatus(jobId);
    }
    catch {
        return NextResponse.json({ error: "Unable to load scan status", correlationId: randomUUID() }, { status: 503 });
    }
    if (!job)
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
    return NextResponse.json({ status: job.status, shareSlug: job.share_slug, processingStage: job.processing_stage, coverage: job.score_coverage, failureCorrelationId: job.failure_correlation_id });
}
