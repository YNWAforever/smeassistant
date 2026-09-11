import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { accessRequestRepository } from "@/lib/repositories/access-requests";
import { claimsRepository } from "@/lib/repositories/claims";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { ipHashFor, recordNeonEvent } from "@/lib/workspace/audit";

/**
 * POST /api/access-requests → 201 { ok, requestId }
 *
 * A merchant whose business cannot be verified through Google asks Fimmick to
 * assign the workspace. Filing is NOT ownership: an operator must still verify
 * independently (guardrail 15).
 *
 * THE BINDING RULE. Nothing may let a signed-in user file against an arbitrary
 * job -- that would put a stranger's business in front of an operator labelled
 * "this person says it is theirs", which is the hijack primitive ownership
 * proof exists to prevent. Eligibility reuses `isLeadRecipient`, the same rule
 * Phase 1 built for magic links, and an ineligible job answers 404 rather than
 * 403 so the response never confirms the job exists.
 *
 * Re-submitting is safe by construction: workspace_access_requests_open_idx is
 * UNIQUE (job_id,user_id) WHERE resolved_at IS NULL, and recordAccessRequest
 * already carries the matching ON CONFLICT DO NOTHING. A fresh `submitted`
 * event is appended every time -- always, rather than only when something
 * changed, so no comparison decides what is worth recording. The rate limit is
 * what bounds it.
 */
const CHANNELS = new Set(["whatsapp", "line", "phone", "email"]);
const MAX_TEXT = 1000;

function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const decision = await enforceRateLimit({ req, scope: "access_request", identifiers: [user.id], failClosed: true });
  if (!decision.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const slug = text(body.slug, 200);
  const intent = text(body.intent);
  const contactIdentifier = text(body.contact_identifier, 200);
  const channel = typeof body.preferred_contact_channel === "string" ? body.preferred_contact_channel : "";
  const evidenceRef = text(body.evidence_ref) ?? null;
  if (!slug || !intent || !contactIdentifier || !CHANNELS.has(channel)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const job = await claimsRepository.jobBySlug(slug);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await claimsRepository.isLeadRecipient(slug, user.email))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await claimsRepository.recordAccessRequest(job.id, user.id);
  const request = await accessRequestRepository().openRequestFor(job.id, user.id);
  if (!request) return NextResponse.json({ error: "unavailable" }, { status: 500 });

  await recordNeonEvent({
    workspaceId: null,
    actorType: "user",
    actorId: user.id,
    event: "access_request.submitted",
    entityType: "workspace_access_request",
    entityId: request.id,
    ipHash: ipHashFor(req),
    payload: {
      intent,
      preferred_contact_channel: channel,
      contact_identifier: contactIdentifier,
      evidence_ref: evidenceRef,
      job_id: job.id,
    },
  });

  return NextResponse.json({ ok: true, requestId: request.id }, { status: 201 });
}
