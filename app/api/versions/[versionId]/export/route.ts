import { authorizeVersionMutation, json, readJson } from "@/app/api/actions/_shared/mutation";
import { localized } from "@/lib/domain";
import { hasNotificationSince, notifyWorkspace, workspaceHomeHref } from "@/lib/workspace/notify";
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
    // In-app notices (Phase 6 item 4); both best-effort and never thrown. The
    // delivery notice fires for a new delivery only (an idempotent retry
    // returns the existing one); the allowance notice once per period.
    if (delivery.kind === "exported") {
      const home = await workspaceHomeHref(auth.db, auth.scope.workspaceId);
      await notifyWorkspace(auth.db, {
        workspaceId: auth.scope.workspaceId,
        kind: "delivery.exported",
        title: localized(mode === "copy" ? "Approved version copied" : "Approved version exported", mode === "copy" ? "已複製批准版本" : "已匯出批准版本"),
        body: usage.allowance === null
          ? localized(`${usage.approvedDeliveries} approved deliveries this period.`, `本期已批准交付 ${usage.approvedDeliveries} 項。`)
          : localized(`${usage.approvedDeliveries} of ${usage.allowance} approved deliveries used this period.`, `本期已用 ${usage.approvedDeliveries} / ${usage.allowance} 項批准交付。`),
        href: home ? `${home}/actions/${auth.scope.actionId}` : null,
      });
    }
    if (usage.allowance !== null && usage.approvedDeliveries >= 0.8 * usage.allowance) {
      const periodStart = `${usage.period}-01T00:00:00Z`;
      if (!(await hasNotificationSince(auth.db, auth.scope.workspaceId, "usage.allowance_80", periodStart))) {
        const home = await workspaceHomeHref(auth.db, auth.scope.workspaceId);
        await notifyWorkspace(auth.db, {
          workspaceId: auth.scope.workspaceId,
          kind: "usage.allowance_80",
          title: localized("80% of this period's delivery allowance used", "本期交付額度已使用 80%"),
          body: localized(`${usage.approvedDeliveries} of ${usage.allowance} approved deliveries used. Upgrade for unlimited deliveries.`, `已用 ${usage.approvedDeliveries} / ${usage.allowance} 項批准交付。升級即可無限交付。`),
          href: home ? `${home}/settings/billing` : null,
        });
      }
    }
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
