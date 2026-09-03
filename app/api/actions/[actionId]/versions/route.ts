import { authorizeActionMutation, json, readJson, UUID_RE } from "@/app/api/actions/_shared/mutation";
import { createVersion, VersionError } from "@/lib/workspace/versions";

/**
 * POST /api/actions/[actionId]/versions { body, alt_text?, base_version_id? }
 * → 201 { versionId, versionNo } | 409 version_conflict. A manual edit is a
 * new version by a user; the RPC supersedes earlier drafts and writes the
 * version.created audit row itself.
 */
export async function POST(req: Request, { params }: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await params;
  const auth = await authorizeActionMutation(req, actionId, "action_mutation");
  if (!auth.ok) return auth.response;

  const payload = await readJson(req);
  const body = typeof payload?.body === "string" ? payload.body : "";
  if (!body.trim() || body.length > 20_000) return json({ error: "body is invalid" }, 400);
  const altText = typeof payload?.alt_text === "string" ? payload.alt_text.trim().slice(0, 500) || null : null;
  const baseVersionId = typeof payload?.base_version_id === "string" ? payload.base_version_id : null;
  if (baseVersionId && !UUID_RE.test(baseVersionId)) return json({ error: "base_version_id is invalid" }, 400);

  try {
    const version = await createVersion(auth.db, { actionId, actorId: auth.user.id, authorType: "user", body, altText, baseVersionId });
    return json(version, 201);
  } catch (error) {
    if (error instanceof VersionError) return json({ error: error.code }, error.code === "version_not_found" ? 404 : 409);
    console.error("[api/actions/versions] failed", { category: "version_create_failed" });
    return json({ error: "unavailable" }, 503);
  }
}
