import { authorizeWorkspaceRequest, type RouteAuth } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/admin";

export interface WorkspaceBillingRow {
  id: string;
  slug: string | null;
  market: string | null;
  tier: string | null;
  stripe_customer_id: string | null;
}

/**
 * Loads this session's access to a workspace's billing actions (checkout,
 * billing portal), plus the workspace's own billing-relevant columns in one
 * round trip. Shared by both owner billing routes so the authorization
 * decision is made identically in both places.
 *
 * Ported from upstream's lib/owner/billing-authorization.ts. Upstream let
 * owners and managers reach billing; this app's authorization matrix
 * (CLAUDE.md §3.9) makes billing an owner-only setting, so the decision is
 * delegated to authorizeWorkspaceRequest with minRole "owner" (staff sessions
 * are never accepted). `slug` is selected too so the Stripe success/return
 * URLs can land on the workspace's own billing page.
 *
 * The workspace lookup only runs once access is already confirmed -- a
 * rejected caller must not cause a workspace read at all, let alone leak
 * whether the id exists.
 */
export async function loadWorkspaceBillingContext(workspaceId: string): Promise<{
  access: RouteAuth;
  workspace: WorkspaceBillingRow | null;
}> {
  const access = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "owner" });
  if (!access.ok) {
    return { access, workspace: null };
  }

  const { data: workspace } = await supabaseServer()
    .from("workspaces")
    .select("id, slug, market, tier, stripe_customer_id")
    .eq("id", workspaceId)
    .maybeSingle<WorkspaceBillingRow>();

  return { access, workspace: workspace ?? null };
}
