import type { Metadata } from "next";

import { BrandView } from "@/components/workspace/brand-view";
import { supabaseServer } from "@/lib/supabase/admin";
import { getBrand } from "@/lib/workspace/brand";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Brand profile", zh: "品牌資料" });
}

/**
 * Any member may read the brand profile agents draft against (§3.9: managers
 * and viewers see it read-only behind the permission banner); only owners can
 * save, and the PUT route enforces the same rule.
 */
export default async function BrandRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const brand = await getBrand(supabaseServer(), page.ctx.workspace.id);
  return <BrandView locale={page.locale} workspaceId={page.ctx.workspace.id} role={page.membership.role} brand={brand} />;
}
