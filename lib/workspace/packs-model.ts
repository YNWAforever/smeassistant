import { CLOSED_ACTION_STATES, type ActionState } from "@/lib/domain";
import type { ActionOverview } from "@/lib/workspace/overview";

/**
 * P4.2 work packs (docs/superpowers/specs/2026-10-02-work-packs-design.md §2): the
 * pure definitions. No server imports, so client components and the repository
 * can import this without pulling the read path in (ruling P4).
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
 * The actions a Start press may spend a model run on, in position order. An item
 * whose action is finished, or whose latest version is already a draft, awaiting
 * changes or approved, is skipped, so starting a pack never re-spends on work
 * that already exists (spec 2.3, review focus 5).
 */
export function packActionsToDraft(pack: PackOverview): string[] {
  return pack.items
    .filter(({ action }) => {
      if (isFinishedState(action.actionState)) return false;
      const approval = action.latestVersion?.approvalState;
      return approval !== "draft" && approval !== "changes_requested" && approval !== "approved";
    })
    .map(({ action }) => action.id);
}
