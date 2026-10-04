import { ActionDetailClient } from "@/components/workspace/action-detail-client"
import type { PrototypeLocale } from "@/lib/copy"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import type { OfferCardData } from "@/components/workspace/action-detail-client"
import type { ActionDetail, AuditEventRow } from "@/lib/workspace/queries-pages"
import type { PublishPanel } from "@/lib/publishing/page-state"

export interface ActionDetailViewProps {
  locale: PrototypeLocale
  workspaceSlug: string
  workspaceId: string
  timezone: string
  role: WorkspaceRole
  inScope: boolean
  location: string
  detail: ActionDetail
  auditRows: AuditEventRow[]
  locations: Array<{ slug: string; name: string }>
  approvedAssets: Array<{ id: string; filename: string }>
  offer?: OfferCardData | null
  latestVersionOfferRevision?: number | null
  offersEnabled?: boolean
  initialVersionId?: string | null
  /** P4.6: the Google publish card's data; null hides it (any other template, or a failed read). */
  publishPanel?: PublishPanel | null
}

/**
 * Server wrapper for the action detail page. The page has already authorised
 * the member (§3.9) and loaded the read model; the client editor owns the
 * draft/approval/export interactions against the Phase 4 routes (§3.2.3) and
 * calls router.refresh() after every accepted mutation so this server tree
 * re-renders from the database, never from optimistic state.
 */
export function ActionDetailView(props: ActionDetailViewProps) {
  return <ActionDetailClient {...props} />
}
