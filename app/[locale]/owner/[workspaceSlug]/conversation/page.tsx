import { notFound } from "next/navigation";
import { ConversationView } from "@/components/workspace/conversation-view";
import { conversationCopy } from "@/lib/copy-conversation";
import { normaliseLocale } from "@/lib/copy";
import { conversationHomeEnabled } from "@/lib/workspace/conversation-flag";
import { conversationStudioEnabled } from "@/lib/studio/flag";
import { studioRepository, toStudioConversation } from "@/lib/repositories/studio";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { getHomeBrief, listActions } from "@/lib/workspace/queries-pages";

export const dynamic = "force-dynamic";
export async function generateMetadata(props: OwnerPageProps) {
  const locale = normaliseLocale((await props.params).locale);
  return ownerPageMetadata(props, { en: conversationCopy.en.switchLabel, zh: conversationCopy["zh-HK"].switchLabel, zhTW: conversationCopy["zh-TW"].switchLabel }).then(metadata => ({ ...metadata, title: conversationCopy[locale].switchLabel }));
}
export default async function ConversationRoute(props: OwnerPageProps) {
  if (!conversationHomeEnabled()) notFound();
  const page = await loadOwnerPage(props);
  const location = page.ctx.locations.find(item => item.slug === page.locationSlug);
  const studioEnabled = conversationStudioEnabled();
  const [result, brief, studioConversations] = await Promise.all([
    listActions(page.ctx, { location: page.locationSlug, pageSize: 50 }),
    getHomeBrief(page.ctx, page.locationSlug).catch(() => null),
    // Convergence bridge: the workbench lists the member's persistent Studio
    // discussions so the two thread stores are visible in one place.
    studioEnabled
      ? studioRepository().listConversations({
          workspaceId: page.ctx.workspace.id,
          actorId: page.membership.userId,
          ...(location?.id ? { locationId: location.id } : {}),
          limit: 8,
        }).then(rows => rows.map(toStudioConversation).map(conversation => ({
          id: conversation.id,
          title: conversation.title,
          lastMessageAt: conversation.lastMessageAt,
        })))
      : Promise.resolve([]),
  ]);
  return <ConversationView
    locale={page.locale} timezone={page.ctx.workspace.timezone} workspaceSlug={page.workspaceSlug} workspaceName={page.ctx.workspace.name}
    location={page.locationSlug} locationName={location?.name ?? ""}
    scope={{ userId: page.membership.userId, workspaceId: page.ctx.workspace.id, locationId: location?.id ?? "all" }}
    connectionOutcome={page.query.connector === "gsc" ? page.query.connected : undefined}
    resources={{ canManage: page.membership.role === "owner" }}
    studioEnabled={studioEnabled}
    studioConversations={studioConversations}
    initialThreadId={page.query.thread}
    today={brief ? { open: brief.openActionCount ?? brief.openActions.length, drafts: brief.month.awaitingApproval, completed: brief.month.completed } : undefined}
    actions={result.actions.map(action => ({ id: action.id, title: action.title[page.locale] ?? action.title.en, ...(action.latestVersion ? { versionId: action.latestVersion.id } : {}) }))}
  />;
}
