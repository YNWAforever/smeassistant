import type { Metadata } from "next";

import { AssetsView } from "@/components/workspace/assets-view";
import { supabaseServer } from "@/lib/supabase/admin";
import { listAssets } from "@/lib/workspace/assets";
import { inScopeFor, loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Brand assets", zh: "品牌素材" });
}

/** Assets with 60 s signed thumbnails; rights decisions are scoped per row (§3.9). */
export default async function AssetsRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const rows = await listAssets(supabaseServer(), page.ctx.workspace.id, page.ctx.locations);
  const assets = rows.map((asset) => ({ ...asset, inScope: inScopeFor(page.membership, asset.location_id) }));
  const scopedLocation = page.locationSlug === "all" ? null : page.ctx.locations.find((l) => l.slug === page.locationSlug) ?? null;
  return (
    <AssetsView
      locale={page.locale}
      workspaceId={page.ctx.workspace.id}
      timezone={page.ctx.workspace.timezone}
      role={page.membership.role}
      location={page.locationSlug}
      locations={page.ctx.locations.map((l) => ({ id: l.id, slug: l.slug, name: l.name }))}
      assets={assets}
      canUpload={page.membership.role !== "viewer" && inScopeFor(page.membership, scopedLocation?.id ?? null)}
    />
  );
}
