import type { Metadata } from "next";

import { BillingView } from "@/components/workspace/billing-view";
import { getBilling } from "@/lib/workspace/billing";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Plan & billing", zh: "方案與帳單" });
}

/**
 * Any member may inspect the plan and usage (§3.9: managers and viewers see
 * the "no billing authority" banner); only owners get the Stripe buttons,
 * and the routes behind them enforce the same rule.
 */
export default async function BillingRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const model = await getBilling(page.ctx);
  return (
    <BillingView
      locale={page.locale}
      workspaceId={page.ctx.workspace.id}
      role={page.membership.role}
      timezone={page.ctx.workspace.timezone}
      model={model}
      checkout={page.query.checkout}
    />
  );
}
