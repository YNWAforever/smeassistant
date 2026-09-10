import {
  json,
  localeFrom,
  objectiveDedupeKey,
  readJson,
  UUID_RE,
} from "@/app/api/actions/_shared/mutation";
import { authorizeWorkspaceRequest, inLocationScope } from "@/lib/auth";
import { localized } from "@/lib/domain";
import {
  enforceRateLimit,
  rateLimitedResponse,
} from "@/lib/security/rate-limit";
import { artifactRepository } from "@/lib/repositories/artifacts";
import { actionMutationRepository } from "@/lib/repositories/action-mutations";
import { freshnessText } from "@/lib/workspace/actions";
import { applyResolvedInputs, resolveEvidenceInputs } from "@/lib/workspace/evidence-inputs";
import { ipHashFor, recordNeonEvent } from "@/lib/workspace/audit";
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
  const workspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id : "";
  if (!UUID_RE.test(workspaceId))
    return json({ error: "workspace_id is invalid" }, 400);
  const templateKey =
    typeof body.template_key === "string" &&
    TEMPLATE_KEYS.has(body.template_key)
      ? (body.template_key as TemplateKey)
      : null;
  if (!templateKey) return json({ error: "template_key is invalid" }, 400);
  const locationId =
    body.location_id === undefined || body.location_id === null
      ? null
      : typeof body.location_id === "string" && UUID_RE.test(body.location_id)
        ? body.location_id
        : "";
  if (locationId === "") return json({ error: "location_id is invalid" }, 400);
  const objective =
    typeof body.objective === "string" ? body.objective.trim() : "";
  if (!objective || objective.length > 500)
    return json({ error: "objective is invalid" }, 400);
  const inputs =
    body.inputs &&
    typeof body.inputs === "object" &&
    !Array.isArray(body.inputs)
      ? (body.inputs as Record<string, unknown>)
      : {};

  const auth = await authorizeWorkspaceRequest(
    { id: workspaceId },
    { minRole: "manager", locationId: locationId ?? undefined },
  );
  if (!auth.ok) return json({ error: auth.code }, auth.status);
  const db = artifactRepository();
  if (locationId) {
    try {
      if (
        !(await db.assistantLocations(workspaceId)).some(
          (l) => l.id === locationId,
        )
      )
        return json({ error: "location_id is invalid" }, 400);
    } catch {
      return json({ error: "unavailable" }, 503);
    }
  }

  const template = TEMPLATES.find((t) => t.key === templateKey)!;
  // Gated on the review key alone, not on "has any server-resolvable input":
  // brand-backed keys need no snapshot, and hoisting the load for them would
  // drag in the location-scope check below and turn today's 201 into a 403 for
  // a scoped manager creating a workspace-wide objective.
  const needsReviewEvidence = template.requiredInputs.includes("reviews_without_response");
  let resolvedInputs: ReadonlySet<string> = new Set<string>();
  if (body.run === true || needsReviewEvidence) {
    try {
      const evidence = await db.assistantLatestSnapshot(
        workspaceId,
        locationId,
      );
      if (evidence && !inLocationScope(auth.membership, evidence.locationId))
        return json({ error: "forbidden" }, 403);
      if (needsReviewEvidence && evidence) {
        resolvedInputs = resolveEvidenceInputs({
          rawData: await db.assistantReviewData(workspaceId, evidence.jobId),
        });
      }
    } catch {
      return json({ error: "unavailable" }, 503);
    }
  }
  const limit = await enforceRateLimit({
    req,
    scope: "action_mutation",
    identifiers: [auth.user.id],
    failClosed: true,
  });
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

  const now = new Date();
  const dedupeKey = objectiveDedupeKey(
    workspaceId,
    locationId,
    templateKey,
    objective,
  );
  // What the owner must still supply, after the scan answers what it can --
  // the same rule lib/repositories/action-derivation.ts applies.
  const requiredInputs = applyResolvedInputs(template.requiredInputs, resolvedInputs);
  const missing = requiredInputs.filter(
    (key) =>
      inputs[key] === undefined || inputs[key] === null || inputs[key] === "",
  );
  let created: { id: string; created: boolean };
  try {
    created = await actionMutationRepository().createObjective({
      workspace_id: workspaceId,
      location_id: locationId,
      template_key: templateKey,
      source: "owner_objective",
      source_finding_keys: [],
      title: template.title,
      summary: template.summary,
      evidence: {
        factType: "Recommended",
        source: "Owner objective",
        value: "",
        detail: localized(objective, objective),
        observedAt: now.toISOString(),
        freshness: freshnessText(now.toISOString(), now),
      },
      priority: "medium",
      priority_score: 50,
      priority_factors: [],
      effort_minutes: template.effortMinutes,
      required_inputs: requiredInputs,
      provided_inputs: inputs,
      action_state: missing.length ? "needs_input" : "recommended",
      measurement_state: "not_eligible",
      capability: template.capability,
      dedupe_key: dedupeKey,
    });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
  const actionId = created.id;
  const locale = localeFrom(req, body);
  if (created.created) {
    await recordNeonEvent({
      workspaceId,
      locationId,
      actorType: "user",
      actorId: auth.user.id,
      event: "action.updated",
      entityType: "action",
      entityId: actionId,
      locale,
      ipHash: ipHashFor(req),
      payload: {
        change: "created",
        source: "owner_objective",
        template_key: templateKey,
      },
    });
  }

  if (body.run !== true) return json({ actionId }, 201);
  try {
    const run = await runAgentForAction(db, {
      actionId,
      actorId: auth.user.id,
      membership: auth.membership,
      locale,
      ipHash: ipHashFor(req),
    });
    return json(
      {
        actionId,
        runId: run.runId,
        versionId: run.versionId,
        state: run.state,
        factsNeeded: run.factsNeeded,
      },
      201,
    );
  } catch (error) {
    // The action exists either way; a template without an agent (or an
    // unavailable one) is reported, not turned into a failed create.
    return json(
      {
        actionId,
        runError: error instanceof RunError ? error.code : "unavailable",
      },
      201,
    );
  }
}
