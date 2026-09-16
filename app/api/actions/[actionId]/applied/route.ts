import { applicationRepository } from "@/lib/repositories/applications";
import { authorizeActionMutation, json, localeFrom, readJson, UUID_RE } from "@/app/api/actions/_shared/mutation";
import { recordNeonEvent } from "@/lib/workspace/audit";

/**
 * POST   /api/actions/[actionId]/applied { output_version_id?, note? } -> 201 { applicationId }
 * DELETE /api/actions/[actionId]/applied                               -> 200 { retracted }
 *
 * The owner's assertion that this action is live in the world
 * (docs/superpowers/specs/2026-09-16-applied-evidence-design.md). This is a
 * self-report and nothing here verifies it -- the next comparable scan is what
 * observes the result, and `attribution_basis='owner_asserted'` travels with
 * every measurement built from it so it is never displayed as a confirmation.
 *
 * authorizeActionMutation is the whole front half: actionId shape, action scope
 * load, owner-or-manager-in-scope for the action's location (viewer and
 * out-of-scope manager -> 403), then one `action_mutation` rate-limit token,
 * fail-closed. Authorization always precedes the limiter so an unauthenticated
 * caller cannot burn a member's budget.
 */
export async function POST(req: Request, { params }: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await params;
  const auth = await authorizeActionMutation(req, actionId, "action_mutation");
  if (!auth.ok) return auth.response;

  const body = (await readJson(req)) ?? {};
  const rawVersion = body.output_version_id;
  if (rawVersion !== undefined && rawVersion !== null && (typeof rawVersion !== "string" || !UUID_RE.test(rawVersion)))
    return json({ error: "output_version_id is invalid" }, 400);
  const versionId = typeof rawVersion === "string" ? rawVersion : null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) || null : null;

  const repo = applicationRepository();
  const { workspaceId, locationId } = auth.scope;

  // Asserting publication of an unapproved draft would record a delivery of
  // something nobody approved (guardrail 5).
  if (versionId) {
    let approved: boolean;
    try {
      approved = await repo.approvedVersion(workspaceId, actionId, versionId);
    } catch {
      return json({ error: "unavailable" }, 503);
    }
    if (!approved) return json({ error: "version_not_applicable" }, 409);
  }

  // Duplicate detection lives entirely in assertApplied's own in-transaction
  // guard (below): a pre-check here would just be a second implementation of
  // the same rule that a hand-kept-in-sync copy could drift from, paid for
  // on every assertion to save a round-trip on the rare double-click.
  // latestOwnerAssertion stays on the repository for Task 8's "you marked
  // this applied on {date}" display -- it is just not called from this route.
  let outcome: Awaited<ReturnType<typeof repo.assertApplied>>;
  try {
    outcome = await repo.assertApplied(
      {
        workspace_id: workspaceId,
        action_id: actionId,
        output_version_id: versionId,
        source: "owner_asserted",
        asserted_by: auth.user.id,
        note,
        evidence: null,
      },
      new Date().toISOString(),
    );
  } catch {
    return json({ error: "unavailable" }, 503);
  }
  // The insert's guard runs inside the same transaction, so a zero-row result
  // means the write already didn't happen -- assertApplied's own diagnostic
  // query (still inside that transaction) tells us why. A duplicate submit
  // is not an error: it gets the same 200 an up-front idempotency check would
  // return, because reporting "this action is closed" for a double-clicked
  // button would be false -- the action is open (per this guard's definition
  // of closed, CLOSED_STATES in lib/repositories/applications.ts --
  // dismissed/cancelled/expired; completed counts as open here) and the
  // other request's assertion is what's on record.
  if (!outcome.ok) {
    if (outcome.reason === "duplicate")
      return json({ applicationId: outcome.existingId, alreadyRecorded: true }, 200);
    return json({ error: "action_closed" }, 409);
  }

  await recordNeonEvent({
    workspaceId,
    locationId,
    actorType: "user",
    actorId: auth.user.id,
    event: "action.applied",
    entityType: "action",
    entityId: actionId,
    locale: localeFrom(req, body),
    ipHash: auth.ipHash,
    payload: { application_id: outcome.id, output_version_id: versionId },
  });

  return json({ applicationId: outcome.id }, 201);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await params;
  const auth = await authorizeActionMutation(req, actionId, "action_mutation");
  if (!auth.ok) return auth.response;

  const repo = applicationRepository();
  const { workspaceId, locationId } = auth.scope;
  // retract() stamps EVERY live owner assertion for this action, not just the
  // newest, and returns how many. Retraction means "I did not apply this", so
  // it must leave no standing claim -- a buried older assertion would keep
  // strongestBasis returning owner_asserted for work the owner just withdrew.
  let retraction: { retracted: number };
  try {
    retraction = await repo.retract(workspaceId, actionId, auth.user.id, new Date().toISOString());
  } catch {
    return json({ error: "unavailable" }, 503);
  }
  if (retraction.retracted === 0) return json({ error: "not_found" }, 404);

  await recordNeonEvent({
    workspaceId,
    locationId,
    actorType: "user",
    actorId: auth.user.id,
    event: "action.application_retracted",
    entityType: "action",
    entityId: actionId,
    locale: localeFrom(req, null),
    ipHash: auth.ipHash,
    payload: { retracted_count: retraction.retracted },
  });

  return json({ retracted: retraction.retracted }, 200);
}
