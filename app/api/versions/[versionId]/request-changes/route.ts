import { authorizeVersionMutation, json, optionalComment, readJson } from "@/app/api/actions/_shared/mutation";
import { decideVersion, VersionError } from "@/lib/workspace/versions";

/** POST /api/versions/[versionId]/request-changes { comment? } → 200 { state:'changes_requested' } | 409 version_closed. */
export async function POST(req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const auth = await authorizeVersionMutation(req, versionId, "action_mutation");
  if (!auth.ok) return auth.response;

  const comment = optionalComment(await readJson(req));
  try {
    const result = await decideVersion(auth.db, { versionId, actorId: auth.user.id, decision: "changes_requested", comment });
    return json({ state: "changes_requested", idempotent: result.kind === "already-decided", versionNo: result.versionNo });
  } catch (error) {
    if (error instanceof VersionError) return json({ error: error.code }, error.code === "version_not_found" ? 404 : 409);
    console.error("[api/versions/request-changes] failed", { category: "version_decide_failed" });
    return json({ error: "unavailable" }, 503);
  }
}
