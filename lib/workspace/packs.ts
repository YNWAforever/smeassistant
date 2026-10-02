import type { HomeBriefViewProps } from "@/components/workspace/home-brief";
import type { Membership } from "@/lib/auth";
import { packRepository } from "@/lib/repositories/packs";
import { buildPackOverview, type PackItemRow, type PackOverview, type WorkPack } from "@/lib/workspace/packs-model";
import { workPacksEnabled } from "@/lib/workspace/packs-flag";
import { inScopeFor } from "@/lib/workspace/page-context";
import type { WorkspaceContext } from "@/lib/workspace/queries";
import { loadActionRows, overviewsFor } from "@/lib/workspace/queries-pages";

// The pure definitions live in packs-model.ts (ruling P4); re-exported so the
// existing server-side import path keeps working.
export {
  STARTER_PACK,
  buildPackOverview,
  isPackFinished,
  type PackItem,
  type PackItemRow,
  type PackKind,
  type PackOverview,
  type PackPosition,
  type StarterItemKey,
  type WorkPack,
} from "@/lib/workspace/packs-model";

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

/**
 * The Home `workPacks` prop (ruling P1). With WORK_PACKS_ENABLED off this returns
 * undefined without touching the repository, so no SQL is issued against
 * work_packs or work_pack_items and Home stays exactly today's.
 *
 * `location.isAll` is a multi-location Home with no single location to start a
 * pack for: it lists the open packs of the locations the caller can read. A read
 * that fails is treated as "no open pack": starting is idempotent, so the worst
 * case is a Start press that returns the pack that was already there.
 */
export async function loadHomeWorkPacks(
  ctx: WorkspaceContext,
  membership: Membership,
  location: { id: string | null; isAll: boolean },
): Promise<HomeBriefViewProps["workPacks"]> {
  if (!workPacksEnabled()) return undefined;
  const repository = packRepository();
  const readOpen = async (locationId: string | null): Promise<PackOverview | null> => {
    try {
      const loaded = await repository.openPack(ctx.workspace.id, locationId);
      return loaded ? await loadPackOverview(ctx, loaded.pack, loaded.itemRows) : null;
    } catch {
      return null;
    }
  };
  const base = {
    workspaceId: ctx.workspace.id,
    workspaceSlug: membership.workspaceSlug,
    role: membership.role,
    usage: { approvedDeliveries: ctx.usage.approvedDeliveries, allowance: ctx.usage.allowance },
  };
  const earlierDrafts = { workspaceId: ctx.workspace.id, role: membership.role };

  if (location.isAll) {
    // Workspace-wide first, then each location the caller can read.
    const candidates: Array<{ id: string | null; name: string | null }> = [
      { id: null, name: null },
      ...ctx.locations.filter((candidate) => inScopeFor(membership, candidate.id)).map((candidate) => ({ id: candidate.id, name: candidate.name })),
    ];
    const open = await Promise.all(candidates.map(async (candidate) => ({ name: candidate.name, pack: await readOpen(candidate.id) })));
    const locationPacks = open.flatMap((entry) => (entry.pack ? [{ name: entry.name, pack: entry.pack }] : []));
    return { enabled: true, card: { ...base, location: { id: null, isAll: true }, inScope: false, initialPack: null, locationPacks }, earlierDrafts };
  }
  return {
    enabled: true,
    card: { ...base, location: { id: location.id, isAll: false }, inScope: inScopeFor(membership, location.id), initialPack: await readOpen(location.id) },
    earlierDrafts,
  };
}
