import { deriveActionsForClaim } from "@/lib/repositories/action-derivation";
import { snapshotRepository } from "@/lib/repositories/snapshots";
import { NextResponse } from "next/server";
import { claimCompletionStore } from "@/lib/repositories/claims";
import { getUser } from "@/lib/auth";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { completeWorkspaceClaim } from "@/lib/workspace/claim";
import { buildSnapshot } from "@/lib/workspace/snapshots";
import { parseClaimBody } from "./parse-body";

/**
 * POST /api/workspaces/claim (CLAUDE.md §3.2.3).
 *
 * Completes a workspace whose job was already attached by an OAuth-verified
 * claim or a staff assignment: locations, brand profile, usage row, snapshot
 * and actions hooks. It never attaches a job (guardrail 15); that decision
 * lives in the OAuth claim callback. Idempotent, so onboarding may retry.
 *
 * Body (snake_case per §3.2.3; the camelCase spellings are accepted too so
 * a client using the TypeScript input type does not silently 400):
 *   { claim_slug, workspace_name, primary_location: { name, address? }, market, timezone?, locale? }
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseClaimBody(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Fail closed: this endpoint writes several tables; a missing limiter must
  // not turn it into an unbounded write path.
  const limit = await enforceRateLimit({ req, scope: "workspace_claim", identifiers: [user.id], failClosed: true });
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

  try {
    // Phase 3 seam (CLAUDE.md Phase 2 item 3): build the snapshot for the
    // claimed job, then derive its actions. Both are idempotent, so a retry of
    // this route after a partial failure converges.
    const result = await completeWorkspaceClaim(claimCompletionStore, { ...parsed.body, userId: user.id }, {
      buildSnapshot: async (jobId) => {
        await buildSnapshot(snapshotRepository(), jobId);
      },
      deriveActions: deriveActionsForClaim,
    });
    switch (result.kind) {
      case "completed":
        return NextResponse.json({ ok: true, workspaceSlug: result.workspaceSlug, locationId: result.locationId });
      case "not_found":
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      case "forbidden":
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      case "not_attached":
        // The job exists but ownership has not been proven yet: the caller
        // must go through the OAuth claim (or ask Fimmick) first.
        return NextResponse.json({ error: "not_attached" }, { status: 409 });
      case "market_mismatch":
        // Refused rather than silently corrected: the market is money-bearing
        // (it selects the Stripe price) and the UI only ever sends the scan's
        // own region, so a disagreement means the body was tampered with or a
        // client is out of date. `expected` lets a legitimate client resend.
        return NextResponse.json({ error: "market_mismatch", expected: result.expected }, { status: 409 });
    }
  } catch (error) {
    console.error("[api/workspaces/claim] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
