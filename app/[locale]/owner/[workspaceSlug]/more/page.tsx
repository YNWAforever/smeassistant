import type { Metadata } from "next";

import { MoreView } from "@/components/workspace/more-view";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "More", zh: "更多" });
}

export default async function MoreRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  return <MoreView locale={page.locale} workspaceSlug={page.workspaceSlug} locationCount={page.ctx.locations.length} />;
}
