import "server-only";

import { studioRepository } from "@/lib/repositories/studio";
import { conversationStudioEnabled } from "@/lib/studio/flag";
import { conversationHomeEnabled } from "@/lib/workspace/conversation-flag";
import { inScopeFor, type OwnerPageContext } from "@/lib/workspace/page-context";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface StudioReturnContext { conversationId: string; locationSlug: string }

type Conversation = { id: string; workspace_id: string; location_id: string | null; status: string };
type ReadConversation = (input: { workspaceId: string; actorId: string; conversationId: string }) => Promise<Conversation | null>;

/** Called only after loadOwnerPage and the task read have authorized the member. */
export async function resolveStudioReturn(
  page: Pick<OwnerPageContext, "membership" | "locationSlug" | "query"> & {
    ctx: { workspace: { id: string }; locations: Array<{ id: string; slug: string }> };
  },
  actionLocation: { id: string | null; slug: string },
  read: ReadConversation = input => studioRepository().getConversation(input),
): Promise<StudioReturnContext | null> {
  const chat = page.query.chat;
  if (page.query.from !== "studio" || !conversationStudioEnabled() || !conversationHomeEnabled() || !chat || !UUID.test(chat)) return null;
  // `all` resolves to this task's actual location; a different selected shop
  // must not smuggle a conversation from another branch into the handoff.
  const location = page.ctx.locations.find(candidate => candidate.id === actionLocation.id && candidate.slug === actionLocation.slug);
  if (!location || (page.locationSlug !== "all" && page.locationSlug !== location.slug) || !inScopeFor(page.membership, location.id)) return null;
  try {
    const row = await read({ workspaceId: page.ctx.workspace.id, actorId: page.membership.userId, conversationId: chat });
    if (!row || row.id !== chat || row.workspace_id !== page.ctx.workspace.id || row.status !== "active") return null;
    if (row.location_id !== null && row.location_id !== location.id) return null;
    // Workspace-wide conversations are intentionally unavailable to managers
    // whose membership is limited to specific locations.
    if (!inScopeFor(page.membership, row.location_id)) return null;
    return { conversationId: row.id, locationSlug: location.slug };
  } catch {
    // Return navigation is optional. An unavailable read must not break review
    // or echo an unvalidated conversation identifier into the client.
    return null;
  }
}
