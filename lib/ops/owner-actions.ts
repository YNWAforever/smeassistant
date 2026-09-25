import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace";
import type { FailureItem, OwnerAction, OwnerProblem } from "./failure-types";

/**
 * Spec §3 owner-action matrix. Resolved on the server; components only render
 * the result. Location scope mirrors lib/auth.ts inLocationScope: only a
 * manager with a non-null location_scope is restricted.
 */
export interface OwnerContext {
  role: WorkspaceRole;
  locationScope: string[] | null;
  tier: "lite" | "paid";
}

function scoped(ctx: OwnerContext): boolean {
  return ctx.role === "manager" && ctx.locationScope !== null;
}

function inScope(ctx: OwnerContext, locationId: string | null): boolean {
  if (!scoped(ctx)) return true;
  return locationId !== null && ctx.locationScope!.includes(locationId);
}

/** Workspace-wide items (no location) are visible to every member; post-processing to none. */
export function visibleTo(item: FailureItem, ctx: OwnerContext): boolean {
  if (item.kind === "workspace_processing") return false;
  if (item.locationId === null) return true;
  return inScope(ctx, item.locationId);
}

export function ownerActionFor(item: FailureItem, ctx: OwnerContext): OwnerAction {
  const canAct = ctx.role === "owner" || (ctx.role === "manager" && inScope(ctx, item.locationId));
  switch (item.kind) {
    case "scan_failed":
      if (!canAct) return "none";
      return ctx.tier === "paid" && item.locationId ? "rescan" : "contact_support";
    case "draft_failed":
      return canAct && item.actionId ? "open_action" : "none";
    case "google_connection":
      return ctx.role === "owner" ? "reauthorise" : ctx.role === "manager" ? "ask_owner" : "none";
    case "scan_dead_lettered":
    case "workspace_processing":
      return "none";
  }
}

/** The Home card follows ?location=; workspace-wide items appear on every location. */
export function filterToLocation<T extends FailureItem>(items: T[], locationId: string | "all"): T[] {
  if (locationId === "all") return items;
  return items.filter((item) => item.locationId === null || item.locationId === locationId);
}

export function buildOwnerProblems(items: FailureItem[], ctx: OwnerContext, contactHref: string | null): OwnerProblem[] {
  return items
    .filter((item) => visibleTo(item, ctx))
    .map((item) => {
      const ownerAction = ownerActionFor(item, ctx);
      return { ...item, ownerAction, contactHref: ownerAction === "contact_support" ? contactHref : null };
    });
}
