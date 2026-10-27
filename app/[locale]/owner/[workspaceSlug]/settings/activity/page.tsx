import type { Metadata } from "next";

import { ActivityView } from "@/components/workspace/activity-view";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { getActivity } from "@/lib/workspace/queries-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Activity", zh: "活動紀錄" });
}

/** Recovery lives beside the owner task; this page is the saved audit record. */
export default async function ActivityRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const events = await getActivity(page.ctx);
  return <ActivityView locale={page.locale} timezone={page.ctx.workspace.timezone} events={events} />;
}
