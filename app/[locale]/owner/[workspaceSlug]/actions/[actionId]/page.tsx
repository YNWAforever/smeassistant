import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActionDetailView } from "@/components/workspace/action-detail-view";
import { inScopeFor, loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { getAction } from "@/lib/workspace/queries-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Action", zh: "行動" });
}

/** Read-only in Phase 3; the Phase 4 mutation routes plug into the disabled controls. */
export default async function ActionDetailRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const { actionId } = await props.params;
  if (!actionId) notFound();
  const detail = await getAction(page.ctx, actionId);
  if (!detail) notFound();
  return (
    <ActionDetailView
      locale={page.locale}
      workspaceSlug={page.workspaceSlug}
      timezone={page.ctx.workspace.timezone}
      role={page.membership.role}
      inScope={inScopeFor(page.membership, detail.action.location.id)}
      location={page.locationSlug}
      detail={detail}
    />
  );
}
