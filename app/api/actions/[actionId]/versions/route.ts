import {
  authorizeActionMutation,
  json,
  readJson,
  UUID_RE,
} from "@/app/api/actions/_shared/mutation";
import {
  createAssistantVersion,
  createVersion,
  VersionError,
} from "@/lib/workspace/versions";

/**
 * POST /api/actions/[actionId]/versions
 *   { body, alt_text?, base_version_id? }   -- a member's own text
 *   { assistant_run_id, base_version_id? }  -- redeem an operator draft
 * → 201 { versionId, versionNo } | 409 version_conflict. The RPC supersedes
 * earlier drafts and writes the version.created audit row itself.
 *
 * The two forms are mutually exclusive, and that is the point. A body is
 * recorded as `author_type: 'user'`; a run id makes the server read the body it
 * already holds and record it as `'agent'`. Accepting both together would let a
 * caller post arbitrary prose and have the append-only log attribute it to a
 * model -- or, as happened before this route grew the second form, have a
 * model's prose attributed to a member.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ actionId: string }> },
) {
  const { actionId } = await params;
  const auth = await authorizeActionMutation(req, actionId, "action_mutation");
  if (!auth.ok) return auth.response;

  const payload = await readJson(req);
  const body = typeof payload?.body === "string" ? payload.body : "";
  const assistantRunId =
    typeof payload?.assistant_run_id === "string"
      ? payload.assistant_run_id
      : null;
  if (assistantRunId && body.trim())
    return json({ error: "body and assistant_run_id are exclusive" }, 400);
  if (assistantRunId && !UUID_RE.test(assistantRunId))
    return json({ error: "assistant_run_id is invalid" }, 400);
  if (!assistantRunId && (!body.trim() || body.length > 20_000))
    return json({ error: "body is invalid" }, 400);
  const altText =
    typeof payload?.alt_text === "string"
      ? payload.alt_text.trim().slice(0, 500) || null
      : null;
  const baseVersionId =
    typeof payload?.base_version_id === "string"
      ? payload.base_version_id
      : null;
  if (baseVersionId && !UUID_RE.test(baseVersionId))
    return json({ error: "base_version_id is invalid" }, 400);

  try {
    // `alt_text` is deliberately ignored on the assistant path: the draft
    // carries its own, and taking the client's would reintroduce exactly the
    // model-text-labelled-by-the-caller problem in a smaller field.
    const version = assistantRunId
      ? await createAssistantVersion(auth.repository, {
          actionId,
          workspaceId: auth.scope.workspaceId,
          actorId: auth.user.id,
          runId: assistantRunId,
          baseVersionId,
        })
      : await createVersion(auth.repository, {
          actionId,
          actorId: auth.user.id,
          authorType: "user",
          body,
          altText,
          baseVersionId,
        });
    return json(version, 201);
  } catch (error) {
    if (error instanceof VersionError)
      return json(
        { error: error.code },
        error.code === "version_not_found" ||
          error.code === "assistant_draft_not_found"
          ? 404
          : 409,
      );
    console.error("[api/actions/versions] failed", {
      category: "version_create_failed",
    });
    return json({ error: "unavailable" }, 503);
  }
}
