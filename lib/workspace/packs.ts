import { CLOSED_ACTION_STATES, type ActionState } from "@/lib/domain";
import type { ActionOverview } from "@/lib/workspace/overview";
import type { WorkspaceContext } from "@/lib/workspace/queries";
import { loadActionRows, overviewsFor } from "@/lib/workspace/queries-pages";

/**
 * P4.2 work packs (docs/superpowers/specs/2026-10-02-work-packs-design.md §2).
 *
 * A pack is a grouping of actions, never a ledger: everything below is derived
 * from each item's `ActionOverview` (its action, latest run and latest version),
 * so a pack can never disagree with the action pages. Nothing here writes.
 */
export const STARTER_PACK = {
  kind: "visibility_starter",
  items: ["review-response", "visibility-content", "website-basics"],
} as const;

export type PackKind = (typeof STARTER_PACK)["kind"];
export type StarterItemKey = (typeof STARTER_PACK)["items"][number];
export type PackPosition = 1 | 2 | 3;

export interface WorkPack {
  id: string;
  workspaceId: string;
  locationId: string | null;
  kind: PackKind;
  createdAt: string;
  closedAt: string | null;
}

/** One `work_pack_items` row as the repository returns it. */
export interface PackItemRow {
  templateKey: StarterItemKey;
  position: PackPosition;
  actionId: string;
}

export interface PackItem {
  templateKey: StarterItemKey;
  position: PackPosition;
  action: ActionOverview;
}

export interface PackOverview {
  pack: WorkPack;
  items: PackItem[];
  counts: { drafted: number; needsInput: number; approved: number; exported: number; failed: number; finished: number };
  nextToReview: { actionId: string; templateKey: StarterItemKey } | null;
  finished: boolean;
}

const FINISHED_STATES: ReadonlySet<ActionState> = new Set(CLOSED_ACTION_STATES);

function isFinishedState(state: ActionState): boolean {
  return FINISHED_STATES.has(state);
}

/**
 * Every item's action is completed, dismissed, cancelled or expired. A pack with
 * no items is not finished: startPack writes all three items in the pack's own
 * transaction, so an empty pack is not a state this reports on.
 */
export function isPackFinished(itemActionStates: ActionState[]): boolean {
  return itemActionStates.length > 0 && itemActionStates.every(isFinishedState);
}

/** Pure: the pack status (spec §2.4), counted from each item's `ActionOverview`. */
export function buildPackOverview(pack: WorkPack, items: PackItem[]): PackOverview {
  const ordered = [...items].sort((a, b) => a.position - b.position);
  const counts = { drafted: 0, needsInput: 0, approved: 0, exported: 0, failed: 0, finished: 0 };
  let nextToReview: PackOverview["nextToReview"] = null;
  for (const item of ordered) {
    const { action } = item;
    const latest = action.latestVersion;
    if (latest) counts.drafted += 1;
    if (action.actionState === "needs_input") counts.needsInput += 1;
    if (latest?.approvalState === "approved") counts.approved += 1;
    if (latest?.deliveryState === "exported") counts.exported += 1;
    if (action.runState === "failed") counts.failed += 1;
    if (isFinishedState(action.actionState)) counts.finished += 1;
    if (!nextToReview && (latest?.approvalState === "draft" || latest?.approvalState === "changes_requested")) {
      nextToReview = { actionId: action.id, templateKey: item.templateKey };
    }
  }
  return {
    pack,
    items: ordered,
    counts,
    nextToReview,
    finished: isPackFinished(ordered.map((item) => item.action.actionState)),
  };
}

/**
 * The read-side overview for one pack. The caller has already authorized the
 * pack's workspace and location; `ctx` must be that workspace's context.
 */
export async function loadPackOverview(ctx: WorkspaceContext, pack: WorkPack, itemRows: PackItemRow[]): Promise<PackOverview> {
  if (pack.workspaceId !== ctx.workspace.id) throw new Error("pack_scope_mismatch");
  const rows = await loadActionRows(ctx.workspace.id, { ids: itemRows.map((item) => item.actionId) });
  const overviews = new Map((await overviewsFor(ctx, rows)).map((overview) => [overview.id, overview]));
  return buildPackOverview(
    pack,
    itemRows.map((item) => {
      const action = overviews.get(item.actionId);
      // work_pack_items.action_id is a foreign key, so a missing row means the
      // action is in another workspace: fail closed rather than drop the item.
      if (!action) throw new Error("pack_item_missing");
      return { templateKey: item.templateKey, position: item.position, action };
    }),
  );
}
