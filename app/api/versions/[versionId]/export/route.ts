import { authorizeVersionMutation, json, readJson } from "@/app/api/actions/_shared/mutation";
import { getUsage } from "@/lib/workspace/usage";
import { exportVersion, VersionError } from "@/lib/workspace/versions";

/**
 * POST /api/versions/[versionId]/export { mode:'export'|'copy', idempotency_key }
 * → 200 { deliveryId, counted, usage } | 409 not_approved | allowance_exceeded.
 * The RPC counts the first delivery of a version exactly once against the
 * period allowance (guardrails 6–7); the same idempotency key returns the
 * existing delivery with counted:false so a retry never double counts.
 */
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{16,64}$/;

export async function POST(req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const auth = await authorizeVersionMutation(req, versionId, "action_mutation");
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  const mode = body?.mode === "export" || body?.mode === "copy" ? body.mode : null;
  if (!mode) return json({ error: "mode must be export or copy" }, 400);
  const idempotencyKey = typeof body?.idempotency_key === "string" && IDEMPOTENCY_RE.test(body.idempotency_key) ? body.idempotency_key : null;
  if (!idempotencyKey) return json({ error: "idempotency_key is invalid" }, 400);

  try {
    const delivery = await exportVersion(auth.db, { versionId, actorId: auth.user.id, mode, idempotencyKey });
    const { data: workspace, error } = await auth.db.from("workspaces").select("timezone, tier").eq("id", auth.scope.workspaceId).maybeSingle<{ timezone: string | null; tier: string | null }>();
    if (error) throw new Error("workspace lookup failed");
    const usage = await getUsage(auth.db, auth.scope.workspaceId, workspace?.timezone || "Asia/Hong_Kong", workspace?.tier === "paid" ? "paid" : "lite");
    return json({
      deliveryId: delivery.deliveryId,
      counted: delivery.counted,
      usage: { period: usage.period, approved_deliveries: usage.approvedDeliveries, allowance: usage.allowance },
    });
  } catch (error) {
    if (error instanceof VersionError) return json({ error: error.code }, error.code === "version_not_found" ? 404 : 409);
    console.error("[api/versions/export] failed", { category: "version_export_failed" });
    return json({ error: "unavailable" }, 503);
  }
}
