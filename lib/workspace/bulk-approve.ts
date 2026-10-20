import type { Membership } from "@/lib/auth"
import { inScopeFor } from "@/lib/workspace/page-context"
import type { ActionOverview } from "@/lib/workspace/overview"
import type { VersionRow } from "@/lib/workspace/queries-pages"

/**
 * Bulk approve (Phase 4 decision 2026-10-20): only review replies and social
 * posts, only drafts that are safe to approve without opening each action.
 * The list here is a convenience; each approval still goes through
 * POST /api/versions/[id]/approve, which re-checks role, scope and state.
 */
export const BULK_APPROVE_TEMPLATES = ["review-response", "social-post"] as const

const CLOSED = new Set(["completed", "dismissed", "cancelled", "expired"])

export type BulkApproveItem = { actionId: string; versionId: string; versionNo: number; title: ActionOverview["title"]; body: string }

/**
 * An action whose latest version can be approved from the queue: an allowed
 * template, an owner or an in-scope manager, an open action with no missing
 * facts, and a latest version that is a draft awaiting approval.
 */
export function isBulkApprovable(action: ActionOverview, membership: Membership): boolean {
  if (!(BULK_APPROVE_TEMPLATES as readonly string[]).includes(action.templateKey)) return false
  if (membership.role !== "owner" && membership.role !== "manager") return false
  if (!inScopeFor(membership, action.location.id)) return false
  if (CLOSED.has(action.actionState) || action.missingInputs.length > 0) return false
  return action.latestVersion?.approvalState === "draft"
}

/**
 * The approvable drafts, with their text so the owner reads each one before
 * approving. A version is offered only if it is still the action's latest,
 * still a draft, and carries no guardrail warning (those need the full page).
 */
export function bulkApproveItems(actions: ActionOverview[], membership: Membership, versions: VersionRow[]): BulkApproveItem[] {
  const latest = new Map<string, VersionRow>()
  for (const version of [...versions].sort((a, b) => b.version_no - a.version_no)) if (!latest.has(version.action_id)) latest.set(version.action_id, version)
  return actions.flatMap((action) => {
    if (!isBulkApprovable(action, membership)) return []
    const version = latest.get(action.id)
    if (!version || version.id !== action.latestVersion?.id || version.approval_state !== "draft" || version.guardrails.length > 0) return []
    return [{ actionId: action.id, versionId: version.id, versionNo: version.version_no, title: action.title, body: version.body }]
  })
}
