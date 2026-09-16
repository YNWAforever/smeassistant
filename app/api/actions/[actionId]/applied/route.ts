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

  // A double-clicked button must not become two assertions.
  try {
    const existing = await repo.latestOwnerAssertion(workspaceId, actionId);
    if (existing && existing.output_version_id === versionId)
      return json({ applicationId: existing.id, alreadyRecorded: true }, 200);
  } catch {
    return json({ error: "unavailable" }, 503);
  }

  let created: { id: string } | null;
  try {
    created = await repo.assertApplied(
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
  // Null here means the in-transaction guard refused the insert. It cannot
  // distinguish "the action is closed" from "a concurrent request already
  // recorded this exact assertion" -- both leave nothing to insert. We chose
  // to report action_closed for both because the alternative (a fresh SELECT
  // to tell them apart) is a third round-trip racing the same window the
  // guard exists to close, and the caller-visible outcome is the same either
  // way: no new assertion was created, and the closed-action reading is the
  // one worth surfacing since it is actionable (the action needs reopening),
  // whereas the duplicate-submit reading is not (the assertion already
  // exists, harmlessly).
  if (!created) return json({ error: "action_closed" }, 409);

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
    payload: { application_id: created.id, output_version_id: versionId },
  });

  return json({ applicationId: created.id }, 201);
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
  let outcome: { retracted: number } | null;
  try {
    outcome = await repo.retract(workspaceId, actionId, auth.user.id, new Date().toISOString());
  } catch {
    return json({ error: "unavailable" }, 503);
  }
  if (!outcome || outcome.retracted === 0) return json({ error: "not_found" }, 404);

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
    payload: { retracted_count: outcome.retracted },
  });

  return json({ retracted: outcome.retracted }, 200);
}
