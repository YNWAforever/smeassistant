import type { Metadata } from "next";

import { NotificationsView } from "@/components/workspace/notifications-view";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { getNotifications } from "@/lib/workspace/queries-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Notifications", zh: "通知" });
}

export default async function NotificationsRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const model = await getNotifications(page.ctx);
  return <NotificationsView locale={page.locale} workspaceId={page.ctx.workspace.id} timezone={page.ctx.workspace.timezone} model={model} />;
}
