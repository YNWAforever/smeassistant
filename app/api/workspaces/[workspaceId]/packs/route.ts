import { json, localeFrom, readJson, UUID_RE } from "@/app/api/actions/_shared/mutation";
import { overviewFor, packsDisabledResponse } from "@/app/api/packs/_shared";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { artifactRepository } from "@/lib/repositories/artifacts";
import { packRepository } from "@/lib/repositories/packs";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { ipHashFor } from "@/lib/workspace/audit";

/**
 * POST /api/workspaces/[id]/packs { location_id: uuid | null } -> 201 { pack, created }
 *   Owner, or a manager in scope for the location. A workspace-wide pack
 *   (location_id null) needs an owner or a manager with no location scope.
 *   A repeat start returns the open pack with created:false.
 * GET  /api/workspaces/[id]/packs?location=<uuid|none> -> 200 { pack: PackOverview | null }
 *   Any member; a scoped manager only for an in-scope location.
 * Starting a pack creates or reuses three actions and never calls a model
 * (docs/superpowers/specs/2026-10-02-work-packs-design.md 3.1).
 */
type Ctx = { params: Promise<{ workspaceId: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const disabled = packsDisabledResponse();
  if (disabled) return disabled;
  const { workspaceId } = await params;
  if (!UUID_RE.test(workspaceId)) return json({ error: "workspaceId is invalid" }, 400);
  const param = new URL(req.url).searchParams.get("location");
  const locationId = param === "none" ? null : param && UUID_RE.test(param) ? param : undefined;
  if (locationId === undefined) return json({ error: "location is invalid" }, 400);

  const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "viewer", locationId: locationId ?? undefined });
  if (!auth.ok) return json({ error: auth.code }, auth.status);
  try {
    const loaded = await packRepository().openPack(workspaceId, locationId);
    return json({ pack: loaded ? await overviewFor(auth.membership, loaded) : null });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const disabled = packsDisabledResponse();
  if (disabled) return disabled;
  const { workspaceId } = await params;
  if (!UUID_RE.test(workspaceId)) return json({ error: "workspaceId is invalid" }, 400);
  const body = await readJson(req);
  if (!body) return json({ error: "Invalid JSON" }, 400);
  // Explicit on purpose: absent is not "workspace-wide".
  const locationId =
    body.location_id === null ? null : typeof body.location_id === "string" && UUID_RE.test(body.location_id) ? body.location_id : undefined;
  if (locationId === undefined) return json({ error: "location_id is invalid" }, 400);

  const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "manager", locationId: locationId ?? undefined });
  if (!auth.ok) return json({ error: auth.code }, auth.status);
  // Ruling P3: a workspace-wide pack spans every location, so a location-scoped manager may not start one.
  if (locationId === null && auth.membership.role !== "owner" && auth.membership.locationScope !== null) {
    return json({ error: "forbidden" }, 403);
  }
  try {
    if (locationId && !(await artifactRepository().assistantLocations(workspaceId)).some((location) => location.id === locationId)) {
      return json({ error: "location_id is invalid" }, 400);
    }
  } catch {
    return json({ error: "unavailable" }, 503);
  }

  const limit = await enforceRateLimit({ req, scope: "action_mutation", identifiers: [auth.user.id], failClosed: true });
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

  try {
    const repository = packRepository();
    const started = await repository.startPack({
      workspaceId,
      locationId,
      actorId: auth.user.id,
      locale: localeFrom(req, body),
      ipHash: ipHashFor(req),
    });
    const loaded = await repository.getPack(started.packId);
    if (!loaded) return json({ error: "unavailable" }, 503);
    return json({ pack: await overviewFor(auth.membership, loaded), created: started.created }, 201);
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}
