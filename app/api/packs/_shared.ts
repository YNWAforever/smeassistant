import { json } from "@/app/api/actions/_shared/mutation";
import type { Membership } from "@/lib/auth";
import type { LoadedPack } from "@/lib/repositories/packs";
import { loadPackOverview } from "@/lib/workspace/packs";
import { workPacksEnabled } from "@/lib/workspace/packs-flag";
import { loadWorkspaceContext } from "@/lib/workspace/queries";

/** Shipped dark: with the flag off every pack route is indistinguishable from a missing route. */
export function packsDisabledResponse(): Response | null {
  return workPacksEnabled() ? null : json({ error: "not_found" }, 404);
}

/** The overview for an already-authorized pack, built from the caller's own workspace context. */
export async function overviewFor(membership: Membership, loaded: LoadedPack) {
  return loadPackOverview(await loadWorkspaceContext(membership), loaded.pack, loaded.itemRows);
}
