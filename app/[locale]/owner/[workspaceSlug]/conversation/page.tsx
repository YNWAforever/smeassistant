import { notFound } from "next/navigation";
import { ConversationView } from "@/components/workspace/conversation-view";
import { conversationCopy } from "@/lib/copy-conversation";
import { normaliseLocale } from "@/lib/copy";
import { conversationHomeEnabled } from "@/lib/workspace/conversation-flag";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { listActions } from "@/lib/workspace/queries-pages";

export const dynamic = "force-dynamic";
export async function generateMetadata(props: OwnerPageProps) {
  const locale = normaliseLocale((await props.params).locale);
  return ownerPageMetadata(props, { en: conversationCopy.en.switchLabel, zh: conversationCopy["zh-HK"].switchLabel, zhTW: conversationCopy["zh-TW"].switchLabel }).then(metadata => ({ ...metadata, title: conversationCopy[locale].switchLabel }));
}
export default async function ConversationRoute(props: OwnerPageProps) {
  if (!conversationHomeEnabled()) notFound();
  const page = await loadOwnerPage(props);
  const result = await listActions(page.ctx, { location: page.locationSlug, pageSize: 50 });
  const location = page.ctx.locations.find(item => item.slug === page.locationSlug);
  return <ConversationView
    locale={page.locale} workspaceSlug={page.workspaceSlug} workspaceName={page.ctx.workspace.name}
    location={page.locationSlug} locationName={location?.name ?? ""}
    scope={{ userId: page.membership.userId, workspaceId: page.ctx.workspace.id, locationId: location?.id ?? "all" }}
    initialThreadId={page.query.thread}
    actions={result.actions.map(action => ({ id: action.id, title: action.title[page.locale] ?? action.title.en, ...(action.latestVersion ? { versionId: action.latestVersion.id } : {}) }))}
  />;
}
