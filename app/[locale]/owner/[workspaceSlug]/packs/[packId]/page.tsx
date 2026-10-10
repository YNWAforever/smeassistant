import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { UUID_RE } from "@/app/api/actions/_shared/mutation";
import { PackUnavailable, PackView } from "@/components/workspace/pack-view";
import { packRepository } from "@/lib/repositories/packs";
import { loadPackOverview } from "@/lib/workspace/packs";
import { workPacksEnabled } from "@/lib/workspace/packs-flag";
import { inScopeFor, loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";

export const dynamic = "force-dynamic";

type PackPageProps = {
  params: Promise<{ locale: string; workspaceSlug: string; packId: string }>;
  searchParams?: OwnerPageProps["searchParams"];
};

export async function generateMetadata(props: PackPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Starter pack", zh: "入門套裝" });
}

/**
 * One work pack (P4.2). Shipped dark: with WORK_PACKS_ENABLED off this is
 * indistinguishable from a missing page, and nothing is read. The pack's
 * workspace and location come from the stored row, never from the URL: a pack of
 * another workspace, or of a location outside a scoped manager's scope, is a 404.
 * There is no approve or export control here; those live on the action's page.
 */
export default async function PackRoute(props: PackPageProps) {
  if (!workPacksEnabled()) notFound();
  const page = await loadOwnerPage(props);
  const { packId } = await props.params;

  if (!UUID_RE.test(packId)) notFound();

  // A failed read is "try again", never "does not exist": only a missing or
  // out-of-scope pack is a 404. The unavailable notice names nothing about the
  // pack, so it reveals no more than a 404 would.
  const unavailable = <PackUnavailable locale={page.locale} workspaceSlug={page.workspaceSlug} />;
  const repository = packRepository();
  let scope: Awaited<ReturnType<typeof repository.packScope>>;
  try {
    scope = await repository.packScope(packId);
  } catch {
    return unavailable;
  }
  if (!scope || scope.workspaceId !== page.ctx.workspace.id) notFound();
  // Reading mirrors GET /api/packs/[packId]: any member, a scoped manager only for an in-scope location.
  if (scope.locationId !== null && !inScopeFor(page.membership, scope.locationId)) notFound();

  let loaded: Awaited<ReturnType<typeof repository.getPack>>;
  try {
    loaded = await repository.getPack(packId);
  } catch {
    return unavailable;
  }
  if (!loaded) notFound();
  let overview: Awaited<ReturnType<typeof loadPackOverview>>;
  try {
    overview = await loadPackOverview(page.ctx, loaded.pack, loaded.itemRows);
  } catch {
    return unavailable;
  }

  const location = scope.locationId ? page.ctx.locations.find((candidate) => candidate.id === scope.locationId) : undefined;
  return (
    <PackView
      locale={page.locale}
      workspaceSlug={page.workspaceSlug}
      role={page.membership.role}
      inScope={inScopeFor(page.membership, scope.locationId)}
      pack={overview}
      locationName={location?.name ?? null}
    />
  );
}
