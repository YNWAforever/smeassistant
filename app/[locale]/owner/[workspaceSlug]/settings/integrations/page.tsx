import type { Metadata } from "next";

import { IntegrationsView } from "@/components/workspace/integrations-view";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { getIntegrations } from "@/lib/workspace/queries-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Integrations", zh: "連接與整合" });
}

/** Owner-only (§3.9): managers and viewers are redirected by requireMembership. */
export default async function IntegrationsRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props, { minRole: "owner" });
  const model = await getIntegrations(page.ctx);
  return <IntegrationsView locale={page.locale} workspaceSlug={page.workspaceSlug} timezone={page.ctx.workspace.timezone} model={model} />;
}
