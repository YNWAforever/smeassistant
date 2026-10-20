import type { Membership } from "@/lib/auth"
import { brandRepository } from "@/lib/repositories/brand"
import { workspaceReadRepository } from "@/lib/repositories/workspace-read"
import type { WorkspaceContext } from "@/lib/workspace/queries"

export type GettingStartedKey = "ownership" | "brand" | "google" | "approve" | "deliver"
export type GettingStartedItem = { key: GettingStartedKey; done: boolean; href: string | null }

/**
 * Today's getting-started checklist (Phase 5 decision: it hides itself once
 * every item is done; no dismissal is stored). Every item is read from data
 * the workspace already holds, scoped to this workspace:
 *  - ownership: being here at all means the claim was verified or assigned;
 *  - brand: a saved brand profile with a voice;
 *  - google: an active Google Business connection;
 *  - approve: any version ever approved;
 *  - deliver: any counted delivery (guardrail 7: first export of an approved version).
 * Viewers cannot act on any item, and demo workspaces must not show invented
 * progress, so both get no checklist. Links point only where the role may go.
 * A failed read hides the checklist rather than showing a wrong tick.
 */
export async function loadGettingStarted(ctx: WorkspaceContext, membership: Membership, locale: string): Promise<GettingStartedItem[] | null> {
  if (membership.role === "viewer" || ctx.workspace.isDemo) return null
  const id = ctx.workspace.id
  const read = workspaceReadRepository()
  try {
    const [brand, connection, approved, deliveries] = await Promise.all([
      brandRepository().get(id),
      read.latestConnection(id),
      read.anyApprovedVersion(id),
      read.deliveries(id, null, 1),
    ])
    const base = `/${locale}/owner/${ctx.workspace.slug}`
    const owner = membership.role === "owner"
    const items: GettingStartedItem[] = [
      { key: "ownership", done: true, href: null },
      { key: "brand", done: Boolean(brand?.voice), href: owner ? `${base}/business/profile` : null },
      { key: "google", done: connection?.status === "active", href: owner ? `${base}/business/integrations` : null },
      { key: "approve", done: approved, href: `${base}/actions?view=awaiting_approval` },
      { key: "deliver", done: deliveries.length > 0, href: `${base}/actions?view=awaiting_approval` },
    ]
    return items.every((item) => item.done) ? null : items
  } catch {
    console.error("[getting-started] read failed", { category: "workspace_query_failed" })
    return null
  }
}
