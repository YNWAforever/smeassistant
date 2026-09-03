import type { Metadata } from "next";

import { InsightsView } from "@/components/workspace/insights-view";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { getInsights } from "@/lib/workspace/queries-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Insights", zh: "成效" });
}

export default async function InsightsRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const model = await getInsights(page.ctx, page.locationSlug);
  return <InsightsView locale={page.locale} workspaceSlug={page.workspaceSlug} timezone={page.ctx.workspace.timezone} locations={page.locations} model={model} />;
}
