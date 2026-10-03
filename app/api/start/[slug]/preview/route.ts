import { NextResponse } from "next/server";
import { AGENT_LLM_OPTIONS, AGENTS, computeCostUsd, parseAgentOutput, type AgentOutput } from "@/lib/agents";
import { pauseState } from "@/lib/budgets/pause";
import { llmComplete, type LLMResult } from "@/lib/llm";
import { buildPreviewContext, previewMarket } from "@/lib/preview/context";
import { authorizePreview } from "@/lib/preview/eligibility";
import { previewDraftEnabled } from "@/lib/preview/flag";
import { parsePreviewInput } from "@/lib/preview/input";
import { readPreviewLimits, type PreviewLimits } from "@/lib/preview/limits";
import { parseViewerGrantCookie, VIEWER_GRANT_COOKIE, type PresentedViewerToken } from "@/lib/report-access/token";
import { previewRepository, type ClaimRefusal, type FinishReason } from "@/lib/repositories/previews";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { ipHashFor } from "@/lib/workspace/audit";

/**
 * POST /api/start/[slug]/preview (P4.5, spec §2.5): one unsaved review_reply
 * draft for the holder of this report's viewer grant. Nothing it produces is
 * stored; the only record is the preview_events slot.
 *
 * Checks run in order and each returns as soon as it fails:
 *   flag → body → viewer grant for a done/partial job → AI pause → limits →
 *   per-IP limiter → slot claim → one model call → finish the slot.
 *
 * The review, the reply and the prompt are never logged; logs carry only
 * `{ category: "preview_<reason>" }`.
 */
export const maxDuration = 60;

type RefusalReason = ClaimRefusal | "ip_limit" | "paused" | "unavailable";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function json(body: unknown, status = 200): Response {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function refused(reason: RefusalReason, category: string = reason): Response {
  console.warn("[api/start/preview] refused", { category: `preview_${category}` });
  return json({ state: "refused", reason });
}

/** The unlock cookie from the request. A malformed escape or value is simply no grant. */
function viewerTokenFrom(request: Request): PresentedViewerToken | null {
  const value = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${VIEWER_GRANT_COOKIE}=`))
    ?.slice(VIEWER_GRANT_COOKIE.length + 1);
  if (!value) return null;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // The header is attacker-controlled; an undecodable value fails parsing below.
  }
  return parseViewerGrantCookie(decoded);
}

type Outcome = { kind: "generated"; output: AgentOutput } | { kind: "failed"; reason: FinishReason };

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  // 1. Off by default, and off means nothing runs: no body parse, no SQL.
  if (!previewDraftEnabled()) return json({ error: "not_enabled" }, 404);

  // 2. The body.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const input = parsePreviewInput(body);
  if (!input.ok) return json({ state: "refused", reason: "invalid_input" }, 400);

  // 3. A valid viewer grant for the job the slug names, finished as done or partial.
  const { slug } = await params;
  let eligible: Awaited<ReturnType<typeof authorizePreview>>;
  try {
    eligible = await authorizePreview({ slug, viewerToken: viewerTokenFrom(request) });
  } catch {
    // Fail closed without telling an unauthorized caller anything about the outage.
    console.error("[api/start/preview] eligibility failed", { category: "preview_eligibility_failed" });
    eligible = null;
  }
  if (!eligible) return json({ error: "not_found" }, 404);
  const { job, grantId } = eligible;

  // 4. AI pause: no claim, no model call.
  if (pauseState().ai) return refused("paused");

  // 5. Limits: an invalid override fails closed.
  let limits: PreviewLimits;
  try {
    limits = readPreviewLimits();
  } catch {
    return refused("unavailable", "limits_invalid");
  }

  // 6. Five a day per source IP, fail-closed. A limiter that is down is `unavailable`, not the visitor's limit.
  const decision = await enforceRateLimit({ req: request, scope: "preview_draft", failClosed: true });
  if (!decision.allowed) return decision.unavailable ? refused("unavailable", "limiter_unavailable") : refused("ip_limit");

  // The preview context does no I/O. It is built before the claim, so nothing that can
  // throw outside a try runs between a successful claim and finishSlot (ruling R8).
  const ctx = buildPreviewContext({
    locale: input.locale,
    market: previewMarket(job.region),
    businessName: job.businessName,
    review: input.review,
    rating: input.rating,
  });

  // 7. The slot: per grant, per job, per day and the daily spend.
  const repo = previewRepository();
  let eventId: string;
  try {
    const claim = await repo.claimSlot({ jobId: job.id, grantId, ipHash: ipHashFor(request), globalDaily: limits.globalDaily, usdDaily: limits.usdDaily });
    if (!claim.allowed) return refused(claim.reason);
    eventId = claim.eventId;
  } catch {
    return refused("unavailable", "claim_failed");
  }

  // 8. One model call over the preview context only. Provider error text never reaches the logs.
  const prompt = AGENTS.review_reply.buildPrompt(ctx);
  let result: LLMResult | null = null;
  try {
    result = await llmComplete(prompt, { ...AGENT_LLM_OPTIONS, redactErrors: true });
  } catch {
    result = null;
  }
  // Ruling R11: a call that reported no usage (or returned nothing) still spent money, so the
  // slot records a conservative estimate (about two characters per input token, the full output
  // allowance) instead of 0; the daily budget then bounds spend without usage reporting.
  const costUsd =
    (result ? computeCostUsd(result.usage) : null) ??
    computeCostUsd({ inputTokens: Math.ceil(prompt.length / 2), outputTokens: AGENT_LLM_OPTIONS.maxTokens }) ??
    0;
  const output = result ? parseAgentOutput(result.text, AGENTS.review_reply.outputSchema) : null;
  const outcome: Outcome = !result
    ? { kind: "failed", reason: "no_output" }
    : !output
      ? { kind: "failed", reason: "invalid_output" }
      : output.facts_needed.length > 0
        ? { kind: "failed", reason: "facts_needed" }
        : { kind: "generated", output };

  try {
    await repo.finishSlot(
      outcome.kind === "generated"
        ? { eventId, outcome: "generated", reason: null, costUsd }
        : { eventId, outcome: "failed", reason: outcome.reason, costUsd },
    );
  } catch {
    // The outcome is already decided; a stale claimed row is released after five minutes.
    console.error("[api/start/preview] finish failed", { category: "preview_finish_failed" });
  }

  if (outcome.kind === "failed") return refused("unavailable", outcome.reason);
  return json({
    state: "generated",
    body: outcome.output.body,
    warnings: [...outcome.output.warnings, ...AGENTS.review_reply.acceptance(ctx, outcome.output)],
  });
}
