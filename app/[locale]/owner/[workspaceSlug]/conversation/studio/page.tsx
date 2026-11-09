import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StudioView } from "@/components/studio/studio-view";
import { studioRepository, toStudioConversation, toStudioMessage } from "@/lib/repositories/studio";
import { buildStudioBriefing, type StudioBriefingResult } from "@/lib/studio/context";
import { ensureStudioStarter } from "@/lib/studio/chips";
import { conversationStudioEnabled } from "@/lib/studio/flag";
import { studioText, formatStudioCopy } from "@/lib/studio/copy";
import {
  STUDIO_CONVERSATION_PAGE,
  STUDIO_MESSAGE_PAGE,
  type StudioContextSummary,
  type StudioConversation,
  type StudioMessage,
  type StudioPromptChip,
} from "@/lib/studio/types";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { conversationHomeEnabled } from "@/lib/workspace/conversation-flag";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  if (!conversationStudioEnabled() || !conversationHomeEnabled()) return { title: "Studio", robots: { index: false, follow: false } };
  return ownerPageMetadata(props, { en: "Studio", zh: "對話工作台" });
}

/**
 * The Conversation Studio page (design §4, §8).
 *
 * Server component: it resolves the member (fail-closed), the `?location=`
 * scope, the caller's own conversation rail, the conversation named by
 * `?chat=` (or the most recent one, so reloading resumes the conversation) and
 * the authorised briefing. Everything the client needs for a first paint is
 * serialisable; all later turns go through `/api/studio/**`.
 *
 * The surface is deliberately absent while `CONVERSATION_STUDIO_ENABLED` is not
 * exactly `"true"` (and the conversation workbench is off): `notFound()` before
 * any data is read, so the owner experience is untouched on a deployment that
 * has not applied migration 0021.
 */
export default async function StudioPage(props: OwnerPageProps) {
  if (!conversationStudioEnabled() || !conversationHomeEnabled()) notFound();

  const page = await loadOwnerPage(props);
  const { locale, membership } = page;
  const workspaceId = page.ctx.workspace.id;
  const actorId = membership.userId;

  const allLocations = page.ctx.locations.map((location) => ({ id: location.id, slug: location.slug, name: location.name }));
  // A scoped manager only sees (and may only create in) locations their
  // membership covers; the routes enforce the same rule server-side.
  const locations = membership.role === "manager" && membership.locationScope
    ? allLocations.filter((location) => membership.locationScope!.includes(location.id))
    : allLocations;
  // The `?location=` value may name a location outside the caller's scope
  // (the workspace shell keeps the param); the Studio opens on the primary
  // in-scope location instead of a select with no matching option.
  const initialLocationSlug = page.locationSlug === "all"
    ? "all"
    : locations.some((location) => location.slug === page.locationSlug)
      ? page.locationSlug
      : locations[0]?.slug ?? "all";
  const locationId = initialLocationSlug === "all" ? null : locations.find((location) => location.slug === initialLocationSlug)?.id ?? null;

  const repo = studioRepository();
  const rows = await repo.listConversations({
    workspaceId,
    actorId,
    // `undefined` lists every conversation the caller owns in the workspace;
    // the repository itself adds workspace-wide rows to a location filter.
    ...(locationId ? { locationId } : {}),
    limit: STUDIO_CONVERSATION_PAGE,
  });
  const conversations: StudioConversation[] = rows.map(toStudioConversation);

  // The briefing is rebuilt from authorised rows on every load. If the scoped
  // location cannot be resolved (a manager outside that location's scope, or a
  // location that disappeared) fall back to the primary scope and finally to
  // the empty summary; the conversation surface must stay usable, and "no rows"
  // is always more honest than a guessed one.
  let briefing: StudioBriefingResult | null = null;
  try {
    briefing = await buildStudioBriefing({ membership, locale, locationSlug: page.locationSlug });
  } catch {
    try {
      briefing = await buildStudioBriefing({ membership, locale });
    } catch {
      briefing = null;
    }
  }
  const text = studioText(locale);
  const contextSummary: StudioContextSummary = briefing?.contextSummary ?? {
    locationName: null,
    latestScan: null,
    openActions: [],
    waitingVersions: 0,
    google: null,
    pendingInputs: 0,
    brandFactCount: 0,
  };

  // A workbench action can deep-link here as `?action=`. The id is only used to
  // find an action the briefing already authorises at this location; the new
  // conversation starts empty with a contextual starter, never with a prefilled
  // answer. An unknown/stale id simply opens the normal most-recent view.
  const requestedActionId = page.query.action && UUID.test(page.query.action) ? page.query.action : null;
  const requestedAction = requestedActionId
    ? briefing?.briefing.openActions.find((action) => action.id === requestedActionId) ?? null
    : null;

  // `?chat=` is honoured only for a conversation the caller actually owns. An
  // unknown id is not an error page: the rail still works, so the Studio opens
  // on the most recent conversation instead of a dead end. Archived rows are
  // fetched so a bookmark keeps its history (read-only).
  const requestedChat = page.query.chat && UUID.test(page.query.chat) ? page.query.chat : null;
  let active = requestedChat ? conversations.find((conversation) => conversation.id === requestedChat) ?? null : null;
  if (!active && requestedChat) {
    const row = await repo.getConversation({ workspaceId, actorId, conversationId: requestedChat });
    if (row) {
      active = toStudioConversation(row);
      conversations.unshift(active);
    }
  }
  // An action deep link starts a fresh conversation so its contextual starter is
  // visible; it must not silently continue an unrelated old thread.
  if (!requestedChat && !requestedAction && conversations.length > 0) active = conversations[0];

  let messages: StudioMessage[] = [];
  let hasMore = false;
  if (active) {
    const rows = await repo.listMessages({
      workspaceId,
      actorId,
      conversationId: active.id,
      // One extra row tells the page whether older turns exist; the rendered
      // window keeps the newest page in ascending order.
      limit: STUDIO_MESSAGE_PAGE + 1,
    });
    hasMore = rows.length > STUDIO_MESSAGE_PAGE;
    messages = (hasMore ? rows.slice(rows.length - STUDIO_MESSAGE_PAGE) : rows).map(toStudioMessage);
  }

  const chips: StudioPromptChip[] = [
    ...(requestedAction
      ? [{
          id: `action:${requestedAction.id}`,
          label: formatStudioCopy(text.empty.actionStarterLabel, { title: requestedAction.title }),
          message: formatStudioCopy(text.empty.actionStarterMessage, { title: requestedAction.title }),
        }]
      : []),
    ...(briefing?.promptChips ?? text.empty.starters.map((starter) => ({ id: starter.id, label: starter.label, message: starter.message }))),
  ];
  // The model-backed IG workflow starter must remain reachable even when the
  // briefing replaces the generic starters with contextual chips.
  const chipsWithIg = ensureStudioStarter(chips, text.empty.starters, "starter_ig");

  return (
    <StudioView
      locale={locale}
      workspaceId={workspaceId}
      workspaceName={page.ctx.workspace.name}
      workspaceSlug={page.workspaceSlug}
      role={membership.role}
      locationSlug={initialLocationSlug}
      locations={locations}
      conversations={conversations}
      activeConversationId={active?.id ?? null}
      initialMessages={messages}
      initialHasMore={hasMore}
      contextSummary={contextSummary}
      chips={chipsWithIg}
    />
  );
}
