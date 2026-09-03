import { json, localeFrom, objectiveDedupeKey, readJson, UUID_RE } from "@/app/api/actions/_shared/mutation";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { localized, OPEN_ACTION_STATES } from "@/lib/domain";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { supabaseServer } from "@/lib/supabase/admin";
import { freshnessText } from "@/lib/workspace/actions";
import { ipHashFor, recordEvent } from "@/lib/workspace/audit";
import { runAgentForAction, RunError } from "@/lib/workspace/runs";
import { TEMPLATES, type TemplateKey } from "@/lib/workspace/templates";

/**
 * POST /api/actions { workspace_id, template_key, location_id?, objective, inputs?, run? }
 * → 201 { actionId, runId?, versionId? }. An owner objective becomes an
 * action with source 'owner_objective' whose evidence is the objective
 * itself, labelled Recommended (never Observed: nothing was measured). One
 * open action per (workspace, location, template, objective) — a repeat
 * submit returns the existing one instead of a duplicate.
 */
export const maxDuration = 60;

const TEMPLATE_KEYS = new Set<string>(TEMPLATES.map((t) => t.key));

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return json({ error: "Invalid JSON" }, 400);
  const workspaceId = typeof body.workspace_id === "string" ? body.workspace_id : "";
  if (!UUID_RE.test(workspaceId)) return json({ error: "workspace_id is invalid" }, 400);
  const templateKey = typeof body.template_key === "string" && TEMPLATE_KEYS.has(body.template_key) ? (body.template_key as TemplateKey) : null;
  if (!templateKey) return json({ error: "template_key is invalid" }, 400);
  const locationId = body.location_id === undefined || body.location_id === null ? null : typeof body.location_id === "string" && UUID_RE.test(body.location_id) ? body.location_id : "";
  if (locationId === "") return json({ error: "location_id is invalid" }, 400);
  const objective = typeof body.objective === "string" ? body.objective.trim() : "";
  if (!objective || objective.length > 500) return json({ error: "objective is invalid" }, 400);
  const inputs = body.inputs && typeof body.inputs === "object" && !Array.isArray(body.inputs) ? (body.inputs as Record<string, unknown>) : {};

  const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "manager", locationId: locationId ?? undefined });
  if (!auth.ok) return json({ error: auth.code }, auth.status);
  const limit = await enforceRateLimit({ req, scope: "action_mutation", identifiers: [auth.user.id], failClosed: true });
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

  const db = supabaseServer();
  if (locationId) {
    const { data: location, error } = await db.from("locations").select("id").eq("id", locationId).eq("workspace_id", workspaceId).maybeSingle();
    if (error) return json({ error: "unavailable" }, 503);
    if (!location) return json({ error: "location_id is invalid" }, 400);
  }

  const template = TEMPLATES.find((t) => t.key === templateKey)!;
  const now = new Date();
  const dedupeKey = objectiveDedupeKey(workspaceId, locationId, templateKey, objective);
  const missing = template.requiredInputs.filter((key) => inputs[key] === undefined || inputs[key] === null || inputs[key] === "");
  const { data: created, error: insertError } = await db
    .from("actions")
    .insert({
      workspace_id: workspaceId,
      location_id: locationId,
      template_key: templateKey,
      source: "owner_objective",
      source_finding_keys: [],
      title: template.title,
      summary: template.summary,
      evidence: { factType: "Recommended", source: "Owner objective", value: "", detail: localized(objective, objective), observedAt: now.toISOString(), freshness: freshnessText(now.toISOString(), now) },
      priority: "medium",
      priority_score: 50,
      priority_factors: [],
      effort_minutes: template.effortMinutes,
      required_inputs: template.requiredInputs,
      provided_inputs: inputs,
      action_state: missing.length ? "needs_input" : "recommended",
      measurement_state: "not_eligible",
      capability: template.capability,
      dedupe_key: dedupeKey,
    })
    .select("id")
    .single<{ id: string }>();

  let actionId = created?.id ?? null;
  if (insertError && (insertError as { code?: string }).code === "23505") {
    const { data: existing } = await db.from("actions").select("id").eq("workspace_id", workspaceId).eq("dedupe_key", dedupeKey).in("action_state", OPEN_ACTION_STATES).limit(1).maybeSingle<{ id: string }>();
    actionId = existing?.id ?? null;
  }
  if (!actionId) {
    console.error("[api/actions] create failed", { category: "action_create_failed" });
    return json({ error: "unavailable" }, 503);
  }
  const locale = localeFrom(req, body);
  if (created) {
    await recordEvent(db, { workspaceId, locationId, actorType: "user", actorId: auth.user.id, event: "action.updated", entityType: "action", entityId: actionId, locale, ipHash: ipHashFor(req), payload: { change: "created", source: "owner_objective", template_key: templateKey } });
  }

  if (body.run !== true) return json({ actionId }, 201);
  try {
    const run = await runAgentForAction(db, { actionId, actorId: auth.user.id, locale, ipHash: ipHashFor(req) });
    return json({ actionId, runId: run.runId, versionId: run.versionId, state: run.state, factsNeeded: run.factsNeeded }, 201);
  } catch (error) {
    // The action exists either way; a template without an agent (or an
    // unavailable one) is reported, not turned into a failed create.
    return json({ actionId, runError: error instanceof RunError ? error.code : "unavailable" }, 201);
  }
}
