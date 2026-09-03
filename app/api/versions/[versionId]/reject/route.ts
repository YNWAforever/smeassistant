import { authorizeVersionMutation, json, optionalComment, readJson } from "@/app/api/actions/_shared/mutation";
import { decideVersion, VersionError } from "@/lib/workspace/versions";

/** POST /api/versions/[versionId]/reject { comment? } → 200 { state:'rejected' } | 409 version_closed. */
export async function POST(req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const auth = await authorizeVersionMutation(req, versionId, "action_mutation");
  if (!auth.ok) return auth.response;

  const comment = optionalComment(await readJson(req));
  try {
    const result = await decideVersion(auth.db, { versionId, actorId: auth.user.id, decision: "rejected", comment });
    return json({ state: "rejected", idempotent: result.kind === "already-decided", versionNo: result.versionNo });
  } catch (error) {
    if (error instanceof VersionError) return json({ error: error.code }, error.code === "version_not_found" ? 404 : 409);
    console.error("[api/versions/reject] failed", { category: "version_decide_failed" });
    return json({ error: "unavailable" }, 503);
  }
}
