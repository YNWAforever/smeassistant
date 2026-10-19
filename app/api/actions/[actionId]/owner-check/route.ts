import { authorizeActionMutation, json, localeFrom, readJson } from "@/app/api/actions/_shared/mutation";
import { ownerReviewCheckRepository } from "@/lib/repositories/owner-review-check";
import { parseOwnerCheck } from "@/lib/workspace/owner-review-check";

/** Member attestation only. Never creates a version, approval, delivery, scan or verified application. */
export async function POST(req: Request, { params }: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await params;
  const auth = await authorizeActionMutation(req, actionId, "action_mutation");
  if (!auth.ok) return auth.response;
  const body = await readJson(req);
  const parsed = parseOwnerCheck(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  try {
    const result = await ownerReviewCheckRepository().record({
      workspaceId: auth.scope.workspaceId, actionId: auth.scope.actionId, locationId: auth.scope.locationId,
      actorId: auth.user.id, ipHash: auth.ipHash, locale: localeFrom(req, body), command: parsed.command,
    });
    if (!result.ok) return json({ error: result.error }, result.error === "not_found" ? 404 : 409);
    return json({ record: result.record, duplicate: result.duplicate }, result.duplicate ? 200 : 201);
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}
