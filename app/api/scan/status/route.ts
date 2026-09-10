import { NextResponse } from "next/server";
import { jobsRepository } from "@/lib/repositories/jobs";
import { randomUUID } from "node:crypto";
import { enforceCompositeIdentifierRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { deriveModuleStates } from "@/lib/workspace/module-states";
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
    // Per-module state (§P1.3): only meaningful once the scan is terminal --
    // deriveModuleStates already returns "pending" for every module otherwise,
    // which the client's own furthest-stage tracking already covers more
    // precisely while running. website is display-only here (no website-checks
    // data is loaded on this hot polling path) and unused by the scanning page.
    const terminal = job.status === "done" || job.status === "partial" || job.status === "failed";
    const moduleStates = terminal
        ? (() => {
            const states = deriveModuleStates({ status: job.status, module_results: job.module_results, module_scores: job.module_scores }, null, false);
            return { google_business: states.google_business.status, instagram: states.instagram.status, search_ai: states.search_ai.status };
        })()
        : null;
    return NextResponse.json({ status: job.status, shareSlug: job.share_slug, processingStage: job.processing_stage, coverage: job.score_coverage, failureCorrelationId: job.failure_correlation_id, moduleStates });
}
