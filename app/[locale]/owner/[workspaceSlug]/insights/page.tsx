import type { Metadata } from "next";

import { InsightsView } from "@/components/workspace/insights-view";
import { RescanButton } from "@/components/workspace/rescan-button";
import { currentScanConsentPolicyVersion } from "@/lib/scan/consent";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { getInsights } from "@/lib/workspace/queries-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Insights", zh: "成效" });
}

export default async function InsightsRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const model = await getInsights(page.ctx, page.locationSlug);
  const locationId = page.ctx.locations.find((location) => location.slug === page.locationSlug)?.id ?? null;
  // The same control Today offers: hidden for viewers, a plan link on the free tier.
  const rescan = locationId ? <RescanButton locale={page.locale} workspaceId={page.ctx.workspace.id} workspaceSlug={page.workspaceSlug}
    locationId={locationId} tier={page.ctx.workspace.tier} role={page.membership.role} consentPolicyVersion={currentScanConsentPolicyVersion()} /> : null;
  return <InsightsView locale={page.locale} workspaceSlug={page.workspaceSlug} timezone={page.ctx.workspace.timezone} locations={page.locations} model={model} rescan={rescan} />;
}
