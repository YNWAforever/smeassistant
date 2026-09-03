import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActionDetailView } from "@/components/workspace/action-detail-view";
import { supabaseServer } from "@/lib/supabase/admin";
import { listAssets } from "@/lib/workspace/assets";
import { inScopeFor, loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { getAction, getActivity } from "@/lib/workspace/queries-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Action", zh: "行動" });
}

/**
 * Action detail: read model + the audit rows that belong to this action (the
 * action itself, its versions and its runs), so the history tab renders real
 * events (§3.11) without a second round trip from the client.
 */
export default async function ActionDetailRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const { actionId } = await props.params;
  if (!actionId) notFound();
  const detail = await getAction(page.ctx, actionId);
  if (!detail) notFound();

  const entityIds = new Set<string>([actionId, ...detail.versions.map((v) => v.id), ...detail.runs.map((r) => r.id)]);
  const [activity, assets] = await Promise.all([
    getActivity(page.ctx, { limit: 200 }),
    listAssets(supabaseServer(), page.ctx.workspace.id, page.ctx.locations, { signedUrls: false }).catch(() => []),
  ]);
  const auditRows = activity.filter((row) => row.entity_id !== null && entityIds.has(row.entity_id));
  const approvedAssets = assets.filter((asset) => asset.rights_status === "approved" && asset.kind === "image").map((asset) => ({ id: asset.id, filename: asset.filename }));

  return (
    <ActionDetailView
      locale={page.locale}
      workspaceSlug={page.workspaceSlug}
      workspaceId={page.ctx.workspace.id}
      timezone={page.ctx.workspace.timezone}
      role={page.membership.role}
      inScope={inScopeFor(page.membership, detail.action.location.id)}
      location={page.locationSlug}
      locations={page.locations}
      detail={detail}
      auditRows={auditRows}
      approvedAssets={approvedAssets}
    />
  );
}
