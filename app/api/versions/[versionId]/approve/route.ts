import { authorizeVersionMutation, json, optionalComment, readJson } from "@/app/api/actions/_shared/mutation";
import { localized } from "@/lib/domain";
import { notifyWorkspace, workspaceHomeHref } from "@/lib/workspace/notify";
import { approveVersion, VersionError } from "@/lib/workspace/versions";

/**
 * POST /api/versions/[versionId]/approve { comment? } → 200 { state:'approved',
 * delivery_state:'export_ready', idempotent } | 409 version_closed. Approval
 * is of this exact version (guardrail 5); the RPC supersedes siblings and
 * writes version.approved itself. A repeat approve is reported, not refused.
 */
export async function POST(req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const auth = await authorizeVersionMutation(req, versionId, "action_mutation");
  if (!auth.ok) return auth.response;

  const comment = optionalComment(await readJson(req));
  try {
    const result = await approveVersion(auth.db, { versionId, actorId: auth.user.id, comment });
    // In-app notice (Phase 6 item 4), first approval only; never throws.
    if (result.kind !== "already-approved") {
      const home = await workspaceHomeHref(auth.db, auth.scope.workspaceId);
      await notifyWorkspace(auth.db, {
        workspaceId: auth.scope.workspaceId,
        kind: "version.approved",
        title: localized(`Version ${result.versionNo} approved`, `第 ${result.versionNo} 版已批准`),
        body: localized("The approved version is ready to export.", "已批准的版本可以匯出。"),
        href: home ? `${home}/actions/${auth.scope.actionId}` : null,
      });
    }
    return json({ state: "approved", delivery_state: "export_ready", idempotent: result.kind === "already-approved", versionNo: result.versionNo });
  } catch (error) {
    if (error instanceof VersionError) return json({ error: error.code }, error.code === "version_not_found" ? 404 : 409);
    console.error("[api/versions/approve] failed", { category: "version_approve_failed" });
    return json({ error: "unavailable" }, 503);
  }
}
