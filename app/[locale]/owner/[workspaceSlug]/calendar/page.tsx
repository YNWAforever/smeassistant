import type { Metadata } from "next";

import { CalendarView } from "@/components/workspace/calendar-view";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { getCalendar } from "@/lib/workspace/queries-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Calendar", zh: "日曆" });
}

export default async function CalendarRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const model = await getCalendar(page.ctx);
  return <CalendarView locale={page.locale} workspaceSlug={page.workspaceSlug} timezone={page.ctx.workspace.timezone} model={model} />;
}
