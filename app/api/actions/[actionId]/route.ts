import { authorizeActionMutation, json, localeFrom, readJson, UUID_RE } from "@/app/api/actions/_shared/mutation";
import { recordEvent } from "@/lib/workspace/audit";
import { loadWorkspaceContext } from "@/lib/workspace/queries";
import { getAction } from "@/lib/workspace/queries-pages";

/**
 * PATCH /api/actions/[actionId] { action_state?: 'dismissed'|'completed', assignee_user_id?, due_at?, provided_inputs? }
 * → 200 { action: ActionOverview }. Provided inputs are merged, not replaced,
 * so the needs_input form can submit one field at a time.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await params;
  const auth = await authorizeActionMutation(req, actionId, "action_mutation");
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  if (!body) return json({ error: "Invalid JSON" }, 400);

  const patch: Record<string, unknown> = {};
  const changes: Record<string, unknown> = {};
  if (body.action_state !== undefined) {
    if (body.action_state !== "dismissed" && body.action_state !== "completed") return json({ error: "action_state must be dismissed or completed" }, 400);
    patch.action_state = body.action_state;
    if (body.action_state === "completed") patch.completed_at = new Date().toISOString();
    changes.action_state = body.action_state;
  }
  if (body.assignee_user_id !== undefined) {
    if (body.assignee_user_id !== null && (typeof body.assignee_user_id !== "string" || !UUID_RE.test(body.assignee_user_id))) return json({ error: "assignee_user_id is invalid" }, 400);
    patch.assignee_user_id = body.assignee_user_id;
    changes.assignee_user_id = body.assignee_user_id;
  }
  if (body.due_at !== undefined) {
    if (body.due_at !== null && (typeof body.due_at !== "string" || Number.isNaN(Date.parse(body.due_at)))) return json({ error: "due_at is invalid" }, 400);
    patch.due_at = body.due_at;
    changes.due_at = body.due_at;
  }
  if (body.provided_inputs !== undefined) {
    if (!body.provided_inputs || typeof body.provided_inputs !== "object" || Array.isArray(body.provided_inputs)) return json({ error: "provided_inputs is invalid" }, 400);
    const { data: current, error } = await auth.db.from("actions").select("provided_inputs, required_inputs, action_state").eq("id", actionId).maybeSingle<{ provided_inputs: unknown; required_inputs: unknown; action_state: string }>();
    if (error) return json({ error: "unavailable" }, 503);
    const existing = current?.provided_inputs && typeof current.provided_inputs === "object" ? (current.provided_inputs as Record<string, unknown>) : {};
    const merged = { ...existing, ...(body.provided_inputs as Record<string, unknown>) };
    patch.provided_inputs = merged;
    changes.provided_inputs = Object.keys(body.provided_inputs as Record<string, unknown>);
    // Once every required input is present a needs_input action becomes ready.
    const required = Array.isArray(current?.required_inputs) ? (current!.required_inputs as string[]) : [];
    const missing = required.filter((key) => merged[key] === undefined || merged[key] === null || merged[key] === "");
    if (patch.action_state === undefined && current?.action_state === "needs_input" && missing.length === 0) patch.action_state = "ready";
  }
  if (Object.keys(patch).length === 0) return json({ error: "nothing to update" }, 400);
  patch.updated_at = new Date().toISOString();

  const { error: updateError } = await auth.db.from("actions").update(patch).eq("id", actionId).eq("workspace_id", auth.scope.workspaceId);
  if (updateError) {
    console.error("[api/actions] update failed", { category: "action_update_failed" });
    return json({ error: "unavailable" }, 503);
  }

  await recordEvent(auth.db, {
    workspaceId: auth.scope.workspaceId,
    locationId: auth.scope.locationId,
    actorType: "user",
    actorId: auth.user.id,
    event: body.action_state === "dismissed" ? "action.dismissed" : "action.updated",
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
    console.error("[api/actions] reload failed", { category: "action_reload_failed" });
    return json({ error: "unavailable" }, 503);
  }
}
