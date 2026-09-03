import type { Metadata } from "next";

import { CreateView } from "@/components/workspace/create-view";
import { resolveText } from "@/lib/domain";
import { inScopeFor, loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { listActions } from "@/lib/workspace/queries-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Create", zh: "建立" });
}

/**
 * Create from an objective (Phase 4 item 4). Goals are the templates; a goal
 * is "evidence-led" when an open action for that template already exists in
 * the scoped location, otherwise it is an owner objective (guardrail 4: the
 * objective is recorded as a Recommended fact, never as a finding).
 */
export default async function CreateRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const location = page.locationSlug === "all" ? null : page.ctx.locations.find((l) => l.slug === page.locationSlug) ?? null;
  const { actions } = await listActions(page.ctx, { location: page.locationSlug, view: "all" });
  const openActions = actions.map((action) => ({
    id: action.id,
    templateKey: action.templateKey,
    evidence: resolveText(action.evidence.detail, page.locale),
    freshness: resolveText(action.evidence.freshness, page.locale),
  }));
  return (
    <CreateView
      locale={page.locale}
      workspaceSlug={page.workspaceSlug}
      workspaceId={page.ctx.workspace.id}
      role={page.membership.role}
      inScope={inScopeFor(page.membership, location?.id ?? null)}
      location={page.locationSlug}
      locationId={location?.id ?? null}
      locations={page.locations}
      openActions={openActions}
    />
  );
}
