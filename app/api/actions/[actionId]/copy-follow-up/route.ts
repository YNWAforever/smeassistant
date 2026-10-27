import { authorizeActionMutation, json, localeFrom, readJson, UUID_RE } from "@/app/api/actions/_shared/mutation";
import { copyFollowUpRepository } from "@/lib/repositories/copy-follow-up";
import type { CopyFollowUpDecision } from "@/lib/workspace/copy-follow-up";

export async function POST(req: Request, { params }: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await params;
  const auth = await authorizeActionMutation(req, actionId, "action_mutation");
  if (!auth.ok) return auth.response;
  const body = await readJson(req);
  if (!body || typeof body.versionId !== "string" || !UUID_RE.test(body.versionId) ||
    !["pending", "not_yet", "later"].includes(String(body.decision)) ||
    body.decision !== "pending" && (typeof body.expectedRecordId !== "string" || !/^[1-9][0-9]{0,18}$/.test(body.expectedRecordId))) {
    return json({ error: "invalid_follow_up" }, 400);
  }
  try {
    const result = await copyFollowUpRepository().record({ workspaceId: auth.scope.workspaceId, actionId,
      versionId: body.versionId, actorId: auth.user.id, locale: localeFrom(req, body), decision: body.decision as CopyFollowUpDecision,
      ...(typeof body.expectedRecordId === "string" ? { expectedRecordId: body.expectedRecordId } : {}) });
    return result.ok ? json({ id: result.id }) : json({ error: result.error }, 409);
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}
