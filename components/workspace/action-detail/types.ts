import type { PrototypeLocale } from "@/lib/copy"
import type { PublishPanel } from "@/lib/publishing/page-state"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import type { ActionDetail, AuditEventRow } from "@/lib/workspace/queries-pages"
import type { OwnerCheckContext } from "@/lib/workspace/owner-review-check"

export interface ActionDetailClientProps {
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
  /** Approved image assets, offered when a social post needs an asset or explicit text-only (§3.7). */
  approvedAssets: Array<{ id: string; filename: string }>
  /**
   * P4.1: the confirmed offer an offer-promotion action is written from, with the
   * price already formatted by the server. Absent for every other action.
   */
  offer?: OfferCardData | null
  /** The revision the latest version recorded (version meta `offer_revision`); null when none was recorded. */
  latestVersionOfferRevision?: number | null
  /** Show the link to the Offers page (the page 404s while the flag is off). */
  offersEnabled?: boolean
  /** The exact version a `?version=` link names. An unavailable version fails closed. */
  initialVersionId?: string | null
  /** P4.6: the Google publish card's data (review-response only); null hides it. The server stays the authority. */
  publishPanel?: PublishPanel | null
  ownerCheck?: OwnerCheckContext
  ownerCheckIdentity?: string
  /** Shown in the Actions side panel, under the queue's own h1: the title becomes an h2. */
  embedded?: boolean
}

export interface OfferCardData {
  title: string
  priceText: string | null
  validFrom: string
  validUntil: string
  revision: number
  status: "draft" | "confirmed" | "archived"
  expired: boolean
}


export type Busy = null | "run" | "save" | "approve" | "decide" | "export" | "copy" | "inputs" | "applied"
export type PreviewRole = "owner" | "manager" | "viewer"
