import { actionMutationRepository } from "@/lib/repositories/action-mutations";
import {
  authorizeActionMutation,
  json,
  localeFrom,
  readJson,
  UUID_RE,
} from "@/app/api/actions/_shared/mutation";
import { recordNeonEvent } from "@/lib/workspace/audit";
import { loadWorkspaceContext } from "@/lib/workspace/queries";
import { getAction } from "@/lib/workspace/queries-pages";

/**
 * PATCH /api/actions/[actionId] { action_state?: 'dismissed', assignee_user_id?, due_at?, provided_inputs? }
 * → 200 { action: ActionOverview }. Provided inputs are merged, not replaced,
 * so the needs_input form can submit one field at a time.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ actionId: string }> },
) {
  const { actionId } = await params;
  const auth = await authorizeActionMutation(req, actionId, "action_mutation");
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  if (!body) return json({ error: "Invalid JSON" }, 400);

  const patch: Record<string, unknown> = {};
  const changes: Record<string, unknown> = {};
  if (body.action_state !== undefined) {
    // `completed` is deliberately NOT accepted here. Completion is a
    // consequence of an owner assertion, written by POST .../applied in the
    // same transaction as the action_applications row -- see
    // docs/superpowers/specs/2026-09-16-applied-evidence-design.md. Allowing a
    // bare PATCH to set it would let an action reach the loop's terminal state
    // with no evidence of what the owner actually did.
    if (body.action_state !== "dismissed")
      return json({ error: "action_state must be dismissed" }, 400);
    patch.action_state = body.action_state;
    changes.action_state = body.action_state;
  }
  if (body.assignee_user_id !== undefined) {
    if (
      body.assignee_user_id !== null &&
      (typeof body.assignee_user_id !== "string" ||
        !UUID_RE.test(body.assignee_user_id))
    )
      return json({ error: "assignee_user_id is invalid" }, 400);
    patch.assignee_user_id = body.assignee_user_id;
    changes.assignee_user_id = body.assignee_user_id;
  }
  if (body.due_at !== undefined) {
    if (
      body.due_at !== null &&
      (typeof body.due_at !== "string" || Number.isNaN(Date.parse(body.due_at)))
    )
      return json({ error: "due_at is invalid" }, 400);
    patch.due_at = body.due_at;
    changes.due_at = body.due_at;
  }
  if (body.provided_inputs !== undefined) {
    if (
      !body.provided_inputs ||
      typeof body.provided_inputs !== "object" ||
      Array.isArray(body.provided_inputs)
    )
      return json({ error: "provided_inputs is invalid" }, 400);
    let current;
    try {
      current = (
        await auth.repository.assistantActions(auth.scope.workspaceId, {
          ids: [actionId],
        })
      )[0];
    } catch {
      return json({ error: "unavailable" }, 503);
    }
    const existing =
      current?.provided_inputs && typeof current.provided_inputs === "object"
        ? (current.provided_inputs as Record<string, unknown>)
        : {};
    const merged = {
      ...existing,
      ...(body.provided_inputs as Record<string, unknown>),
    };
    patch.provided_inputs = merged;
    changes.provided_inputs = Object.keys(
      body.provided_inputs as Record<string, unknown>,
    );
    // Once every required input is present a needs_input action becomes ready.
    const required = Array.isArray(current?.required_inputs)
      ? (current!.required_inputs as string[])
      : [];
    const missing = required.filter(
      (key) =>
        merged[key] === undefined || merged[key] === null || merged[key] === "",
    );
    if (
      patch.action_state === undefined &&
      current?.action_state === "needs_input" &&
      missing.length === 0
    )
      patch.action_state = "ready";
  }
  if (Object.keys(patch).length === 0)
    return json({ error: "nothing to update" }, 400);
  patch.updated_at = new Date().toISOString();

  try {
    await actionMutationRepository().patch(
      actionId,
      auth.scope.workspaceId,
      patch,
    );
  } catch {
    return json({ error: "unavailable" }, 503);
  }

  await recordNeonEvent({
    workspaceId: auth.scope.workspaceId,
    locationId: auth.scope.locationId,
    actorType: "user",
    actorId: auth.user.id,
    event:
      body.action_state === "dismissed" ? "action.dismissed" : "action.updated",
    entityType: "action",
    entityId: actionId,
    locale: localeFrom(req, body),
    ipHash: auth.ipHash,
    payload: changes,
  });

  try {
    const ctx = await loadWorkspaceContext(auth.membership);
    const detail = await getAction(ctx, actionId);
    if (!detail) return json({ error: "not_found" }, 404);
    return json({ action: detail.action });
  } catch {
    console.error("[api/actions] reload failed", {
      category: "action_reload_failed",
    });
    return json({ error: "unavailable" }, 503);
  }
}
