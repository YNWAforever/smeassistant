import { NextResponse } from "next/server";
import { resolveOperator } from "@/lib/auth/operator";
import { accessRequestRepository, resolveAccessRequest } from "@/lib/repositories/access-requests";
import { assistedAssignmentEnabled } from "@/lib/workspace/assignment-flag";
import { decisionIsTerminal, isAssistedDecision, parseVerification } from "@/lib/workspace/assisted-assignment";

/**
 * PATCH /api/ops/access-requests/[requestId] → 200 { ok, workspaceId, slug }
 *
 * Gate order is the contract and is tested in both directions:
 *   flag → operator → request → decision.
 *
 * The DEC-06 flag is the FIRST statement, before authorization and before the
 * body is read, and answers 404 rather than 403 so the route's existence is not
 * itself a signal. Precedent: app/api/oauth/google/claim/start/route.ts.
 */
const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function PATCH(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  if (!assistedAssignmentEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const operator = await resolveOperator();
  if (!operator) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { requestId } = await params;
  if (!UUID_RE.test(requestId)) return NextResponse.json({ error: "requestId is invalid" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const decision = body.decision;
  if (!isAssistedDecision(decision)) return NextResponse.json({ error: "decision is invalid" }, { status: 400 });
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason || reason.length > 2000) return NextResponse.json({ error: "reason is required" }, { status: 400 });

  // Terminal decisions must record WHAT was verified and BY WHOM (item 19).
  // Asking a question is not a decision, so it needs none.
  const verification = decisionIsTerminal(decision) ? parseVerification(body.verification) : null;
  if (decisionIsTerminal(decision) && !verification) {
    return NextResponse.json({ error: "verification is required" }, { status: 400 });
  }

  const found = await accessRequestRepository().get(requestId);
  if (!found) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (found.request.resolved_at) return NextResponse.json({ error: "already_decided" }, { status: 409 });

  try {
    const result = await resolveAccessRequest({
      request: {
        id: found.request.id,
        job_id: found.request.job_id,
        user_id: found.request.user_id,
        requester_email: found.request.requester_email,
        business_name: found.request.business_name,
        region: found.request.region,
        industry: found.request.industry,
        district: found.request.district,
      },
      decision,
      reason,
      verification,
      operator,
    });
    return NextResponse.json({ ok: true, workspaceId: result.workspaceId, slug: result.slug });
  } catch (error) {
    // The loser of a race sees a refusal, never a silent success.
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "already_decided" }, { status: 409 });
    }
    if ((error as Error).message === "already_claimed") {
      return NextResponse.json({ error: "already_claimed" }, { status: 409 });
    }
    console.error("[ops/access-requests] decision failed", { category: "access_request_decision_failed" });
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
