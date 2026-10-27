import type { Metadata } from "next";

import { InsightsView } from "@/components/workspace/insights-view";
import { inScopeFor, loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { RescanButton } from "@/components/workspace/rescan-button";
import { currentScanConsentPolicyVersion } from "@/lib/scan/consent";
import { canRescan, rescanOwnerCopy } from "@/lib/workspace/rescan-eligibility";
import { getInsights } from "@/lib/workspace/queries-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Insights", zh: "成效" });
}

export default async function InsightsRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const model = await getInsights(page.ctx, page.locationSlug);
  const locationId = model.location?.id ?? null;
  const allowed = model.series.length > 0 && canRescan({ tier: page.ctx.workspace.tier, role: page.membership.role, locationId, inScope: inScopeFor(page.membership, locationId) });
  return <InsightsView locale={page.locale} workspaceSlug={page.workspaceSlug} timezone={page.ctx.workspace.timezone} locations={page.locations} model={model} rescanAllowed={allowed} rescan={allowed && <div className="owner-results-tools"><p>{rescanOwnerCopy[page.locale].prompt}</p><RescanButton locale={page.locale} workspaceId={page.ctx.workspace.id} workspaceSlug={page.workspaceSlug} locationId={locationId} tier={page.ctx.workspace.tier} role={page.membership.role} consentPolicyVersion={currentScanConsentPolicyVersion()} /></div>} />;
}
