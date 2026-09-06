import "server-only";
import type { Pool } from "pg";
import { getPool } from "../db/client";
import { withTransaction } from "../db/transaction";
import { workspaceReadRepository } from "./workspace-read";
import type { WorkspaceBillingRow } from "../owner/billing-authorization";
import type { WorkspaceTier } from "../workspace/entitlement";

/** Explicit billing capabilities. Stripe calls stay outside database transactions. */
export function billingRepository(pool?: Pool) {
  const db = () => pool ?? getPool();
  return {
    async workspace(id: string): Promise<WorkspaceBillingRow | null> {
      return (
        (
          await db().query<WorkspaceBillingRow>(
            "SELECT id,slug,market,tier,stripe_customer_id FROM workspaces WHERE id=$1",
            [id],
          )
        ).rows[0] ?? null
      );
    },
    async findWorkspace(workspaceId: string | null, customerId: string | null) {
      if (!workspaceId && !customerId) return null;
      const rows = (
        await db().query<{ id: string; tier: string | null }>(
          workspaceId
            ? "SELECT id,tier FROM workspaces WHERE id=$1"
            : "SELECT id,tier FROM workspaces WHERE stripe_customer_id=$1",
          [workspaceId ?? customerId],
        )
      ).rows;
      if (rows.length > 1) throw new Error("ambiguous_stripe_customer");
      return rows[0] ?? null;
    },
    async applyTier(
      workspaceId: string,
      tier: WorkspaceTier,
      stripeEventId: string,
    ): Promise<void> {
      await withTransaction(async (client) => {
        const workspace = (
          await client.query(
            "SELECT tier FROM workspaces WHERE id=$1 FOR UPDATE",
            [workspaceId],
          )
        ).rows[0];
        if (!workspace) throw new Error("billing_workspace_not_found");
        if (workspace.tier === tier) return;
        const event = await client.query(
          `INSERT INTO workspace_tier_events(workspace_id,tier,source,stripe_event_id)
      VALUES($1,$2,'stripe_webhook',$3) ON CONFLICT(stripe_event_id) WHERE stripe_event_id IS NOT NULL DO NOTHING RETURNING id`,
          [workspaceId, tier, stripeEventId],
        );
        if (!event.rows.length) {
          const prior = (
            await client.query(
              "SELECT workspace_id FROM workspace_tier_events WHERE stripe_event_id=$1",
              [stripeEventId],
            )
          ).rows[0];
          if (prior?.workspace_id !== workspaceId)
            throw new Error("stripe_event_workspace_conflict");
        }
        // A legacy event may predate atomic writes. Reapply the freshly retrieved
        // current entitlement on retry while retaining its unique event history.
        await client.query("UPDATE workspaces SET tier=$2 WHERE id=$1", [
          workspaceId,
          tier,
        ]);
      }, db());
    },
    async saveCustomer(workspaceId: string, customerId: string): Promise<void> {
      const result = await db().query(
        "UPDATE workspaces SET stripe_customer_id=$2 WHERE id=$1 AND (stripe_customer_id IS NULL OR stripe_customer_id=$2) RETURNING id",
        [workspaceId, customerId],
      );
      if (!result.rows.length) throw new Error("stripe_customer_conflict");
    },
    async tierEvents(workspaceId: string, limit = 10) {
      if (!Number.isSafeInteger(limit) || limit < 0)
        throw new Error("invalid_page_limit");
      return (
        await db().query<{
          id: string;
          tier: string;
          source: string;
          stripe_event_id: string | null;
          created_at: string;
        }>(
          "SELECT id,tier,source,stripe_event_id,created_at::text FROM workspace_tier_events WHERE workspace_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2",
          [workspaceId, limit],
        )
      ).rows;
    },
    usage(workspaceId: string, period: string, allowance: number | null) {
      return workspaceReadRepository(db()).usage(
        workspaceId,
        period,
        allowance,
      );
    },
  };
}
